const path = require('path');

const appDir = process.env.APP_DIR || '/www/wwwroot/debatetimer-api';

module.exports = {
    apps: [
        {
            name: process.env.PM2_APP || 'debatetimer-api',
            cwd: path.join(appDir, 'server'),
            script: 'index.js',
            interpreter: 'node',
            instances: 1,
            exec_mode: 'fork',
            watch: false,
            max_memory_restart: '300M',
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};
