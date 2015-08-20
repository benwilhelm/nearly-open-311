var _ = require("lodash");
var async = require('async');
var request = require('request');
var yaml = require("js-yaml");
var fs = require("fs");
var requestTypes = yaml.safeLoad(fs.readFileSync('./data/_request-types.yml'));

module.exports = function(){
  var cookieJar = request.jar();
  var req = request.default({jar: cookieJar, timeout: 30000});

  var requestObject = {
    /**
     * Initialize the request with an address and request type.
     * @param opts - object containing keys requestType, streetNumber, streetDirection, streetName, streetSuffix, streetSuffixDir
     * @param callback - callback function with signature function(err, request)
     */
    initialize: function(opts, callback) {
      opts = _.merge({
        requestType: "AAE",
        streetNumber: 4955,
        streetDirection: "N",
        streetName: "Damen",
        streetSuffix: "Ave"
      }, opts)

      var urls = generateUrls(opts)

      async.series([
        function(next){
          console.log('initializing')
          req.get({
            url: urls.reset
          }, next)
        },
        function(next) {
          console.log('setting address')
          var postData = {
            invStreetNumber: opts.streetNumber,
            invStreetDirection: opts.streetDirection,
            invStreetName: opts.streetName,
            invStreetSuffix: opts.streetSuffix
          }
          req.post({
            url: urls.setLocation,
            formData: postData
          }, next)
        },
        function(next) {
          console.log('setting request type')
          req.get({
            url: urls.selectService
          }, next)
        }
      ], function(err, rslt){
        callback(err, rslt[2])
      })
    }
  }

  return requestObject;
}

var defaultUrls = {
  reset: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=reset",
  setLocation: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=locvalidate",
  selectService: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=csrform&invSRType="
}

function generateUrls(opts) {
  var urls = _.clone(defaultUrls);
  urls.selectService += opts.requestType;
  return urls;
}
