# Диалоги Авито · Telegram Mini App

Эта папка готова для отдельного GitHub-репозитория. Скопируйте её содержимое, включая `.gitignore`, в корень репозитория и отправьте в GitHub. В `public` находится интерфейс, в `functions` и `lib` находится API, а в `migrations` — SQL для базы истории.

## 1. Подключите GitHub к Cloudflare Pages

В Cloudflare откройте **Workers & Pages**, создайте проект **Pages** через подключение Git-репозитория и выберите репозиторий GitHub. Укажите следующие параметры. [Git-интеграция Pages](https://developers.cloudflare.com/pages/get-started/git-integration/) · [Настройки сборки](https://developers.cloudflare.com/pages/configuration/build-configuration/)

| Параметр | Значение |
| --- | --- |
| Production branch | `main` или ваша основная ветка |
| Framework preset | `None` |
| Build command | `exit 0` |
| Build output directory | `public` |
| Root directory | Оставьте пустым, если содержимое папки лежит в корне репозитория. Если перенесли папку целиком, укажите `cloudflare-pages` либо фактический путь до неё. |

Cloudflare собирает Pages Functions из `functions` рядом с `public`. [Структура Pages Functions](https://developers.cloudflare.com/pages/functions/get-started/)

## 2. Подключите D1 и переменные

1. В Cloudflare создайте базу D1, например `avito-dialogs`. Один раз примените SQL из `migrations/0001_dialogs.sql`. Можно выполнить его в консоли D1 или через Wrangler из корня перенесённого проекта. [Cloudflare D1](https://developers.cloudflare.com/d1/get-started/)

   ```powershell
   npx wrangler@4 d1 execute avito-dialogs --remote --file ./migrations/0001_dialogs.sql
   ```

2. В настройках **Production** проекта Pages добавьте привязку к этой базе с именем **`DB`**. [Привязки базы в Pages](https://developers.cloudflare.com/pages/functions/bindings/#d1-databases)
3. В **Settings → Variables and Secrets** добавьте значения для **Production**.

   | Имя | Значение |
   | --- | --- |
   | `TELEGRAM_BOT_ID` | Числовой ID бота, часть токена до двоеточия. |
   | `TELEGRAM_OPERATOR_ID` | Числовой ID аккаунта, привязанного к боту. |
   | `MINIAPP_SYNC_KEY` | Секрет из 64 шестнадцатеричных символов. Тот же ключ нужен в локальном лаунчере. |

4. Повторно запустите Production-деплой после настройки привязки и переменных. Для первого просмотра интерфейса добавьте `?demo=1` к адресу `pages.dev`. Этот режим использует вымышленные диалоги.

## 3. Подключите локальный лаунчер

На компьютере с Авито, из корня исходного проекта, полностью закройте старое окно лаунчера и запустите его следующим образом.

```powershell
$env:AVITO_MINIAPP_URL = 'https://ваш-проект.pages.dev'
$env:AVITO_MINIAPP_SYNC_KEY = Read-Host 'Ключ синхронизации'
.\Launcher.cmd
```

Бот установит кнопку **Диалоги** в личном чате. История начнёт пополняться по мере того, как лаунчер открывает переписки. Для доступа к API требуется подтверждённый оператор Telegram. Полный токен бота остаётся на компьютере с лаунчером. [Проверка подписи Telegram Mini Apps](https://core.telegram.org/bots/webapps#validating-data-for-third-party-use)
