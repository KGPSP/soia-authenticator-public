# SOIA Authenticator — strona publiczna

Oficjalne informacje, polityka prywatności, pomoc oraz materiały sklepowe dla aplikacji SOIA Authenticator wydawanej przez Komendę Główną Państwowej Straży Pożarnej.

Strona produkcyjna: <https://kgpsp.github.io/soia-authenticator-public/>

## Granica publikacji

To repozytorium nie zawiera kodu aplikacji mobilnej, konfiguracji EAS, kluczy, poświadczeń, logów urządzeń ani historii prywatnego repozytorium. Zawiera wyłącznie statyczny kod witryny, publiczne dokumenty i zatwierdzone materiały sklepowe.

Aplikacja jest przeznaczona wyłącznie na iPhone oraz telefony z Androidem. Repozytorium nie zawiera materiałów dla iPada, tabletów z Androidem, ChromeOS ani Android XR.

## Kontrola lokalna

```sh
npm ci
npm test
npm run check
```

Witryna nie ma zależności produkcyjnych, analityki, formularzy ani zewnętrznych fontów.

## Prawa

Kod HTML, CSS i skrypty kontrolne tego repozytorium są licencjonowane na warunkach EUPL-1.2. Kod aplikacji mobilnej jest własnościowy. Oficjalne znaki, grafiki, treści prawne i materiały KG PSP pozostają objęte odrębnymi prawami — zobacz [NOTICE.md](NOTICE.md).
