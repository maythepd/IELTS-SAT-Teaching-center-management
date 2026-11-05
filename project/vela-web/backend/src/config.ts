import path from 'node:path';
export const config = {
  port: Number(process.env.PORT || 4000),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  production: process.env.NODE_ENV === 'production',
  mfa: process.env.MFA_REQUIRED !== 'false',
  dataPath: path.resolve(process.env.DATA_DIRECTORY || 'data'),
  key: process.env.DATA_KEY_HEX || '',
  db: {
    server: process.env.DB_SERVER || 'localhost',
    port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME || 'TeachingCenter',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    pool: {
      min: 0,
      max: 10,
      idleTimeoutMillis: 30000
    },
    options: {
      trustedConnection: process.env.DB_AUTH === 'windows',
      encrypt: process.env.DB_ENCRYPT !== 'false',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
      useUTC: true
    },
    ...(process.env.DB_AUTH === 'windows' ? {
      connectionString: `Driver={ODBC Driver 18 for SQL Server};Server=${process.env.DB_SERVER || 'localhost'};Database=${process.env.DB_NAME || 'TeachingCenter'};Trusted_Connection=Yes;Encrypt=${process.env.DB_ENCRYPT === 'false' ? 'No' : 'Yes'};TrustServerCertificate=${process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' ? 'Yes' : 'No'};`
    } : {})
  }
};
