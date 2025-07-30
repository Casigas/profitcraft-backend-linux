const config = {
    user: 'ProfitCraftUser',
    password: 'ParolaComplexa123!',
    server: 'profitcraftserver.database.windows.net',
    database: 'ProfitCraftDB',
    options: {
        encrypt: true,
        trustServerCertificate: false,
        enableArithAbort: true
    }
};

module.exports = config;