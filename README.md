#  Story Protocol Monitor Bot

Bot Telegram do monitorowania protokołu Story Protocol - śledzenie nowych tokenów IP, duzych transakcji i alertów w czasie rzeczywistym.

##  Funkcje

- ⚡ **Monitorowanie w czasie rzeczywistym** - Nowe tokeny IP, wielorybie transakcje
- 🐋 **Alerty wielorybich** - Konfigurowalne progi dla dużych transakcji  
- 💰 **Śledzenie nowych tokenów** - Automatyczne wykrywanie nowo utworzonych IP assets
- 📊 **Analiza portfeli** - Szczegółowa analiza aktywności portfeli
- 🔔 **Spersonalizowane alerty** - Dostosowywalne powiadomienia

##  Wymagania systemowe

- Node.js v18 lub nowszy
- npm lub yarn
- Token bota Telegram (od @BotFather)

## ⚙️ Instalacja lokalna
1. git clone
2. utworz plik o nazwie .env
3. Dodaj nastepujące stałe:
   OBOWIĄZKOWE - Token bota Telegram
   BOT_TOKEN=your_telegram_bot_token_here 
   OPCJONALNE - RPC Story Protocol (jeśli nie podano, używa trybu fallback)
    STORY_RPC_URL=https://mainnet.storyrpc.io
    OPCJONALNE - Konfiguracja alertów
    DEFAULT_WHALE_THRESHOLD=40
    MONITORING_INTERVAL=30000OPCJONALNE - Konfiguracja bazy danych
    DB_PATH=./data/bot.dbOPCJONALNE - Konfiguracja logów
    LOG_LEVEL=info
    LOG_FILE=./logs/bot.log
## Uruchom Bota
npm start

## Wyszukaj swojego bota w telegramie i uzywajac komendy /start rozpocznij dzialanie

   

    
