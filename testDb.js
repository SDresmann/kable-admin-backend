const mongoose = require('mongoose');

let testConnection = null;

/**
 * Call from server.js after mongoose.connect.
 * If ATLAS_URI_TEST is set, use that as the connection for the "test" DB (same as Kable Career).
 * Otherwise use the default connection's "test" database (useDb('test')).
 */
function setTestConnection(conn) {
  testConnection = conn;
}

function getTestDb() {
  if (testConnection) return testConnection;
  return mongoose.connection.useDb('test');
}

module.exports = { setTestConnection, getTestDb };
