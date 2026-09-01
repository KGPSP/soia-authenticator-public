import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const basePath = "/soia-authenticator-public/";
const publicOrigin = "https://kgpsp.github.io";
const requiredPages = new Map([
  ["index.html", ""],
  ["polityka-prywatnosci/index.html", "polityka-prywatnosci/"],
  ["pomoc/index.html", "pomoc/"],
  ["dane-i-prywatnosc/index.html", "dane-i-prywatnosc/"],
  ["bezpieczenstwo/index.html", "bezpieczenstwo/"],
  ["dostepnosc/index.html", "dostepnosc/"],
  ["informacje-prawne/index.html", "informacje-prawne/"],
  ["wydania/index.html", "wydania/"],
  ["404.html", "404.html"],
]);
const expectedPngs = {
  "assets/google-play/icon-512.png": [512, 512],
  "assets/google-play/feature-graphic.png": [1024, 500],
  "assets/google-play/phone/01-kody-offline.png": [1080, 1920],
  "assets/google-play/phone/02-szyfrowana-kopia.png": [1080, 1920],
  "assets/google-play/phone/03-dodaj-konto.png": [1080, 1920],
  "assets/google-play/phone/04-ochrona-aplikacji.png": [1080, 1920],
  "assets/app-store/iphone-6.9/01-kody-offline.png": [1320, 2868],
  "assets/app-store/iphone-6.9/02-szyfrowana-kopia.png": [1320, 2868],
  "assets/app-store/iphone-6.9/03-dodaj-konto.png": [1320, 2868],
  "assets/app-store/iphone-6.9/04-ochrona-aplikacji.png": [1320, 2868],
};
const forbiddenPagePatterns = [
  /<form\b/iu,
  /<script\b/iu,
  /(?:google-analytics|googletagmanager|segment\.com|sentry\.io)/iu,
];
const forbiddenRepositoryPatterns = [
  /otpauth:\/\//iu,
  /\/Users\//u,
  /KGPSP\/soia-authenticator(?:\.git)?/u,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /(?:secret|token|password)\s*[:=]/iu,
];
const forbiddenFileNames = [/^\.env/u, /eas\.json$/u, /credentials?/iu, /\.soiaauth$/u];
const approvedEmails = new Set([
  "informacje@kg.straz.gov.pl",
  "iod@kg.straz.gov.pl",
]);

async function collectFiles(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", ".public-import", "node_modules"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    const path = relative(root, absolute).split(sep).join("/");
    const stats = await lstat(absolute);
    if (stats.isSymbolicLink()) throw new Error(`Niedozwolony symlink: ${path}`);
    if (stats.isDirectory()) files.push(...(await collectFiles(root, absolute)));
    else if (stats.isFile()) files.push(path);
  }
  return files.sort();
}

function canonicalFor(route) {
  return `${publicOrigin}${basePath}${route}`;
}

function parseAttributes(html, attribute) {
  const values = [];
  const pattern = new RegExp(`\\b${attribute}=["']([^"']+)["']`, "giu");
  for (const match of html.matchAll(pattern)) values.push(match[1]);
  return values;
}

function readPngDimensions(buffer, path) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error(`Nieprawidłowy nagłówek PNG: ${path}`);
  }
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20), buffer[25]];
}

function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(left, right) {
  const [lighter, darker] = [luminance(left), luminance(right)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function internalTarget(root, currentFile, value) {
  const clean = value.split("#")[0].split("?")[0];
  if (!clean || clean.startsWith("mailto:") || clean.startsWith("https://")) return null;
  if (clean.startsWith(basePath)) {
    const relativeTarget = clean.slice(basePath.length);
    if (relativeTarget === "") return resolve(root, "index.html");
    if (relativeTarget.endsWith("/")) {
      return resolve(root, relativeTarget, "index.html");
    }
    return resolve(root, relativeTarget);
  }
  if (clean.startsWith("/")) throw new Error(`Link poza bazą Pages: ${value}`);
  return resolve(dirname(join(root, currentFile)), clean);
}

export async function checkSite(siteRoot) {
  const root = resolve(siteRoot);
  const files = await collectFiles(root);
  const forbiddenMatches = [];
  const externalRuntimeUrls = [];

  for (const file of files) {
    if (forbiddenFileNames.some((pattern) => pattern.test(file))) {
      forbiddenMatches.push(`${file}:niedozwolona nazwa`);
    }
    if (file.endsWith(".png")) continue;
    const text = await readFile(join(root, file), "utf8");
    for (const pattern of forbiddenRepositoryPatterns) {
      if (pattern.test(text)) forbiddenMatches.push(`${file}:${pattern}`);
    }
    const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu) ?? [];
    for (const email of emails) {
      if (!approvedEmails.has(email.toLowerCase())) {
        forbiddenMatches.push(`${file}:niedozwolony e-mail`);
      }
    }
  }

  for (const [file, route] of requiredPages) {
    if (!files.includes(file)) throw new Error(`Brak wymaganej strony: ${file}`);
    const html = await readFile(join(root, file), "utf8");
    if (!/^<!doctype html>/iu.test(html)) throw new Error(`Brak doctype: ${file}`);
    if (!/<html\s+lang="pl"/iu.test(html)) throw new Error(`Brak lang=pl: ${file}`);
    if (!/<meta\s+name="description"\s+content="[^"]+"/iu.test(html)) {
      throw new Error(`Brak opisu meta: ${file}`);
    }
    const expectedCanonical = canonicalFor(route);
    if (!html.includes(`<link rel="canonical" href="${expectedCanonical}">`)) {
      throw new Error(`Nieprawidłowy canonical: ${file}`);
    }
    if (!html.includes(`${basePath}assets/css/soia.css`)) {
      throw new Error(`Brak lokalnego arkusza stylów: ${file}`);
    }
    for (const pattern of forbiddenPagePatterns) {
      if (pattern.test(html)) forbiddenMatches.push(`${file}:${pattern}`);
    }
    for (const value of [...parseAttributes(html, "href"), ...parseAttributes(html, "src")]) {
      if (/^https?:\/\//iu.test(value)) {
        const isRuntime = /<(?:script|img|link)[^>]+(?:src|href)=["'][^"']+/iu.test(
          html.match(new RegExp(`[^>]*(?:src|href)=["']${value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}["'][^>]*`, "iu"))?.[0] ?? "",
        );
        if (isRuntime && !value.startsWith(publicOrigin)) externalRuntimeUrls.push(value);
        continue;
      }
      const target = internalTarget(root, file, value);
      if (target) {
        try {
          const stats = await lstat(target);
          if (!stats.isFile()) throw new Error();
        } catch {
          throw new Error(`Niedziałający link ${value} w ${file}`);
        }
      }
    }
  }

  for (const [path, [width, height]] of Object.entries(expectedPngs)) {
    if (!files.includes(path)) throw new Error(`Brak grafiki: ${path}`);
    const [actualWidth, actualHeight, colorType] = readPngDimensions(
      await readFile(join(root, path)),
      path,
    );
    if (actualWidth !== width || actualHeight !== height || colorType !== 2) {
      throw new Error(`Nieprawidłowy format grafiki: ${path}`);
    }
  }

  const css = await readFile(join(root, "assets/css/soia.css"), "utf8");
  const requiredTokens = [
    "#0B1523",
    "#101D30",
    "#16263D",
    "#223650",
    "#E8EEF5",
    "#8CA0B8",
    "#1D5FAE",
    "#4C8FD6",
    "#F08A00",
    "#2F9E63",
    "#D22730",
  ];
  for (const token of requiredTokens) {
    if (!css.includes(token)) throw new Error(`Brak kanonicznego koloru: ${token}`);
  }
  for (const [foreground, background] of [
    ["#E8EEF5", "#0B1523"],
    ["#E8EEF5", "#101D30"],
    ["#4C8FD6", "#0B1523"],
    ["#FFFFFF", "#1D5FAE"],
  ]) {
    if (contrast(foreground, background) < 4.5) {
      throw new Error(`Kontrast poniżej WCAG AA: ${foreground}/${background}`);
    }
  }

  if (forbiddenMatches.length > 0) throw new Error(forbiddenMatches.join(", "));
  if (externalRuntimeUrls.length > 0) {
    throw new Error(`Zewnętrzne zasoby runtime: ${externalRuntimeUrls.join(", ")}`);
  }

  const tabletAssets = files.filter((path) =>
    /ipad|tablet|chromeos|android-xr/iu.test(path),
  ).length;
  if (tabletAssets > 0) throw new Error("Repozytorium zawiera zasoby tabletowe.");

  return {
    routeCount: requiredPages.size,
    language: "pl",
    basePath,
    googlePhoneScreenshots: files.filter((path) =>
      path.startsWith("assets/google-play/phone/"),
    ).length,
    iphoneScreenshots: files.filter((path) =>
      path.startsWith("assets/app-store/iphone-6.9/"),
    ).length,
    tabletAssets,
    externalRuntimeUrls,
    forbiddenMatches,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const report = await checkSite(root);
  console.log(
    `Sprawdzono ${report.routeCount} tras, ${report.googlePhoneScreenshots} grafik Google phone i ${report.iphoneScreenshots} grafik iPhone.`,
  );
}
