const config = {
    user: 'ProfitCraftUser',              // Numele login-ului creat
    password: 'ParolaComplexa123!',       // Parola pe care ați setat-o
    server: 'profitcraftserver.database.windows.net',
    database: 'ProfitCraftDB',
    options: {
        encrypt: true,
        trustServerCertificate: false,
        enableArithAbort: true
    }
};

module.exports = config;