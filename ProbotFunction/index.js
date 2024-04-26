const {
  createProbot,
  createAzureFunction,
} = require("@probot/adapter-azure-functions");
const app = require("../app/index");

module.exports = createAzureFunction(app, { probot: createProbot() });