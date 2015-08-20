var _ = require("lodash");
var async = require('async');
var request = require('request');
var requestTypes =

module.exports = function(){
  var cookieJar = request.jar();
  var req = request.default({jar: cookieJar, timeout: 30000});

  return {
    /**
     * Initialize the request with an address and request type.
     * @param opts - object containing keys requestType, streetNumber, streetDirection, streetName, streetSuffix, streetSuffixDir
     * @param callback - callback function with signature function(err, request)
     */
    initialize: function(/*opts, */callback) {
      opts = {
        requestType: "AAE",
        streetNumber: 4955,
        streetDirection: "N",
        streetName: "Damen",
        streetSuffix: "Ave"
      }

      var urls = generateUrls(opts)
      console.log(urls);

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
