var yaml = require("js-yaml");
var fs = require("fs");
var requestTypes = yaml.safeLoad(fs.readFileSync(__dirname + '/../data/request-types.yml'));

module.exports = requestTypes;
