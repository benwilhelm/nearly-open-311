var _ = require("lodash");
var async = require('async');
var request = require('request');
var yaml = require("js-yaml");
var fs = require("fs");
var requestTypes = yaml.safeLoad(fs.readFileSync(__dirname + '/data/request-types.yml'));

module.exports = function(){
  var cookieJar = request.jar();
  var req = request.defaults({jar: cookieJar, timeout: 30000});
  var fieldDefinitions = {};
  var contactData = {};
  var contactDataIsValid = false;
  var urls = {};
  var requestType;
  var requestFormData = {};
  var formDataIsValid = false;

  /**
   * The main request object returned by the module
   */
  var requestObject = {

    /**
     * Initialize the request with an address and request type.
     * @param opts - object containing the following keys:
     *   - requestType
     *   - streetNumber
     *   - streetDirection
     *   - streetName
     *   - streetSuffix
     *   - streetSuffixDir
     * @param callback - callback function with signature function(err, request)
     */
    initialize: function(opts, callback) {

      urls = generateUrls(opts);
      fieldDefinitions = getFieldDefinitions(opts.requestType);
      requestType = opts.requestType;

      async.series([
        function(next){
          req.get({
            url: urls.reset
          }, next)
        },
        function(next) {
          var postData = {
            invInterfaceType: "WEBINTAK",
            invJurisdictionCode: "CHICAGO",
            invStreetNumber: opts.streetNumber,
            invStreetPrefix: opts.streetDirection,
            invStreetName: opts.streetName,
            invStreetSuffix: opts.streetSuffix,
            invSRTypeCode:"",
            invLocRequired:"",
            invStreetNumRequired:"",
            invStreetSuffixDir:"",
            invCity:"CHICAGO",
            invStateCode:"IL",
            invZipCode:"",
            invCounty:"",
            invBuildingName:"",
            invFloor:"",
            invUnitNumber:""
          }

        //   var postData = require(__dirname + "/test-location.json");
          req.post({
            url: urls.setLocation,
            form: postData
          }, next)
        },
        function(next) {
          // console.log('setting request type')
          req.get({
            url: urls.selectService
          }, next)
        }
      ], function(err, rslt){
        callback(err, rslt[2])
      })
    },

    /**
     * Set the form data for the request.
     * Returns true if data is valid, or error hash if not
     */
    setFormData: function(data) {
      formDataIsValid = false;
      var validated = validateFormData(data, requestType);
      if (validated === true) {
        requestFormData = data;
        formDataIsValid = true;
      }
      return validated;
    },

    getForm: function() {
      return fieldDefinitions;
    },



    /**
     * Set contact info for the request.
     * emailAddress is the only required property
     * @param data - an object with the following keys:
     *
     *   - emailAddress * Required
     *   - firstName
     *   - lastName
     *   - streetNumber
     *   - streetDirection
     *   - streetName
     *   - streetSuffix
     *   - streetSuffixDir
     *   - phone1
     *   - phone1Type
     *   - phone1Ext
     *   - phone2
     *   - phone2Type
     *   - phone2Ext
     *   - phone3
     *   - phone3Type
     *   - phone3Ext
     *   - textUpdates
     */
    setContactData: function(data) {
        contactDataIsValid = false;
        var validated = validateContactData(data);
        if (validated === true) {
          contactData = data;
          contactDataIsValid = true;
        }
        return validated;
    },


    verify: function(callback) {
      if (!formDataIsValid)    return callback({reason: "Form Data is invalid"});
      if (!contactDataIsValid) return callback({reason: "Contact Data is invalid"});

      var filteredContactData = convertContactData(contactData, requestType);
      var compositeRequestData = _.merge(requestFormData, filteredContactData);
      compositeRequestData.invSRShowLocation = "ALLOWLOC";
      compositeRequestData.invInterfaceType  = "WEBINTAK";
      compositeRequestData.invJurisdictionCode = "DALLAS"; // seriously?
      compositeRequestData.invSRTypeCode = requestType;
      // console.log(compositeRequestData);

      // compositeRequestData = require(__dirname + "/test-review.json");

      req.post({ url: urls.reviewRequest, form: compositeRequestData }, function(err, req, txt){
        if (err)  return callback(err);
        if (!txt) return callback({reason: "An unknown error occurred."})
        callback(arguments);
      })
    },


    /**
     * Submits the request
     */
    submit: function(callback) {
      req.post({url: urls.submitRequest, form: {}}, callback);
    }
  }

  return requestObject;



  // ========================
  // PRIVATE FUNCTIONS
  // ========================

  function validateFormData(data) {
    var invalid = false;
    var errorObj = { invalid: true, errors: {} };

    if (!requestType) {
      invalid = true;
      errorObj.errors.requestType = "RequestType is not yet defined. Make sure you're initializing the request before submitting form data.";
    }

    var dataKeys = _.keys(data);
    _.each(fieldDefinitions, function(field, key) {

      // check for required field
      if (field.required && !_.contains(dataKeys, key)) {
        invalid = true;
        errorObj.errors[key] = key + " is a required field.";
      }

      // check for option-based questions
      if (field.options && data[key] && !_.contains(field.options, data[key])) {
        invalid = true;
        errorObj.errors[key] = key + " must be one of: " + field.options.join(' | ');
      }
    });

    return (invalid) ? errorObj : true;
  }

  function validateContactData(data) {
      var invalid = false;
      var errorObj = { invalid: true, errors: {} };

      if (!isEmail(data.emailAddress)) {
          invalid = true;
          errorObj.errors.emailAddress = "That email address does not appear to be valid"
      }

      if (!data.emailAddress) {
          invalid = true;
          errorObj.errors.emailAddress = "Email Address (emailAddress) is required"
      }

      _.each(["phone1", "phone2", "phone3"], function(key){
          var normalized = normalizePhone(data[key])
          if (data[key] && !normalized) {
              invalid = true;
              errorObj.errors[key] = key + " does not appear to be a valid phone number"
          }
      })

      return (invalid) ? errorObj : true;
  }
}




// ========================
// MODULE FUNCTIONS
// ========================


var defaultUrls = {
  reset: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=reset",
  setLocation: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=locvalidate",
  selectService: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=csrform&invSRType=",
  reviewRequest: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=review",
  submitRequest: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=csrupdate"
}

function generateUrls(opts) {
  var urls = _.clone(defaultUrls);
  urls.selectService += opts.requestType;
  urls.selectService += "&invSRDesc=" + encodeURIComponent(requestTypes[opts.requestType]);
  return urls;
}

function getFieldDefinitions(type) {
  type = type.toUpperCase();
  if (!_.contains(_.keys(requestTypes), type)) {
    throw new Error("Non-existent request type: " + type);
  }

  var path = __dirname + "/data/request-type-definitions/" + type + ".yml";
  try {
    var yml = fs.readFileSync(path);
    return yaml.safeLoad(yml);
  } catch (e) {
    throw new Error("Request type '" + type + "' has not been implemented yet.  See the module README for instructions for implementing it yourself");
  }
}

/**
 * a very permissive validator.  Mostly just a sanity check
 */
function isEmail(address) {
    return address && !!address.match(/^(.+)@(.+)\.(.+)$/)
}

function convertContactData(data, requestType) {
    var fieldMap = {
        "emailAddress"    : "invParticipantEmailAddress_CALLER",
        "firstName"       : "invParticipantFirstName_CALLER",
        "lastName"        : "invParticipantLastName_CALLER",
        "streetNumber"    : "invParticipantStreetNumber_CALLER",
        "streetDirection" : "invParticipantStreetPrefix_CALLER",
        "streetName"      : "invParticipantStreetName_CALLER",
        "streetSuffix"    : "invParticipantStreetSuffix_CALLER",
        "city"            : "invParticipantCity_CALLER",
        "state"           : "invParticipantStateCode_CALLER",
        "zip"             : "invParticipantZipCode_CALLER",
        "phone1"          : "invParticipantContactPhoneType_CALLER_1",
        "phone1Type"      : "invParticipantContactPhoneNumber_CALLER_1",
        "phone1Ext"       : "invParticipantContactPhoneDetails_CALLER_1",
        "phone2"          : "invParticipantContactPhoneType_CALLER_2",
        "phone2Type"      : "invParticipantContactPhoneNumber_CALLER_2",
        "phone2Ext"       : "invParticipantContactPhoneDetails_CALLER_2",
        "phone3"          : "invParticipantContactPhoneType_CALLER_3",
        "phone3Type"      : "invParticipantContactPhoneNumber_CALLER_3",
        "phone3Ext"       : "invParticipantContactPhoneDetails_CALLER_3"
    }

    var convertedData = {};
    _.each(fieldMap, function(chiKey, key){
        convertedData[chiKey] = data[key] || "";
    })

    if (data.phone1 && data.textUpdates) {
        convertedData["fn_" + requestType + "_A511OPTN"] = data.phone1;
    }

    return convertedData;
}

function normalizePhone(input) {
    input = input+'';
    input = input.replace(/\D/g, "");   // remove non-numeric characters
    input = input.replace(/^1/, "");    // remove leading 1 if present

    // check that remainder is 10 digits, split into components for easy formatting
    var match = input.match(/^\d{10}$/);

    if (!match) {
        return false;
    }

    return match[0]
}
