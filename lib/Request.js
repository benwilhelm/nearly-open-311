var _ = require("lodash");
var async = require('async');
var cheerio = require('cheerio');
var fs = require('fs');
var request = require('request');
var utilFuncs = require(__dirname + "/util");
var yaml = require("js-yaml")
module.requestTypes = require(__dirname + "/requestTypesList")


/**
 * The exported request object
 */
var Request = function(requestType) {
    var self = this;

    this.requestType = requestType;
    this.urls = generateUrls(requestType);
    this.fieldDefinitions = getFieldDefinitions(requestType);
    this.cookieJar = request.jar();

    this.initialized = false;
    this.contactData = {};
    this.contactDataIsValid = false;
    this.requestFormData = {};
    this.formDataIsValid = false;
}

/**
 * Initialize the request with an address
 * @param opts - object containing the following keys:
 *   - streetNumber
 *   - streetDirection
 *   - streetName
 *   - streetSuffix
 *   - streetSuffixDir
 * @param callback - callback function with signature function(err, request)
 */
Request.prototype.initialize = function(opts, callback) {
    var self = this;
    self.req = req = request.defaults({jar: this.cookieJar, timeout: 30000});
    async.waterfall([

        // getting session
        function(next){
            req.get({
                url: self.urls.reset
            }, next)
        },

        // setting location of complaint
        function(res, text, next) {
            var postData = getFormDataFromMarkup(text);
            postData.invStreetNumber = opts.streetNumber,
            postData.invStreetPrefix = opts.streetDirection,
            postData.invStreetName     = opts.streetName,
            postData.invStreetSuffix = opts.streetSuffix,

            req.post({
                url: self.urls.setLocation,
                form: postData
            }, next)
        },

        // setting service request type
        function(res, text, next) {
            req.get({
                url: self.urls.selectService
            }, next)
        },

        // seeding requestFormData with .NET hidden fields
        function(res, text, next) {
            var formData = getFormDataFromMarkup(text);
            self.requestFormData = _.merge(formData, self.requestFormData);
            self.initialized = true;
            next(null, text);
        }
    ], callback)
};

/**
 * Set the form data for the request.
 * Returns true if data is valid, or error hash if not
 */
Request.prototype.setFormData = function(data) {
    var self = this;
    self.formDataIsValid = false;
    var validated = validateFormData(data, self.requestType);
    if (validated === true) {
        self.requestFormData = _.merge(self.requestFormData, data);
        self.formDataIsValid = true;
    }
    return validated;
}

Request.prototype.getFormData = function() {
    var self = this;
    if (!initialized) throw new Error("Please call initialize before calling getFormData")
    return requestFormData;
},

Request.prototype.getForm = function() {
    var self = this;
    if (!initialized) throw new Error("Please call initialize before calling getForm")
    return fieldDefinitions;
},

Request.prototype.getRequestTypes = function() {
    var self = this;
    if (!initialized) throw new Error("Please call initialize before calling getRequestTypes")
    return module.requestTypes;
},

Request.prototype.getUserInput = function(idx) {
    var self = this;
    if (!initialized) throw new Error("Please call initialize before calling getUserInput")

    if (idx && self.fieldDefinitions[idx])
        return self.requestFormData[idx];

    var keys = _.keys(self.fieldDefinitions);
    return _.pick(self.requestFormData, keys);
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
Request.prototype.setContactData = function(data) {
    var self = this;
    self.contactDataIsValid = false;
    var validated = validateContactData(data);
    if (validated === true) {
        self.contactData = data;
        self.contactDataIsValid = true;
    }
    return validated;
},


Request.prototype.verify = function(callback) {
    var self = this;
    if (!self.formDataIsValid)    return callback({reason: "Form Data is invalid"});
    if (!self.contactDataIsValid) return callback({reason: "Contact Data is invalid"});

    var filteredContactData = convertContactData(self.contactData, self.requestType);
    var compositeRequestData = _.merge(self.requestFormData, filteredContactData);

    var requestKeys = _.keys(compositeRequestData);
    self.req.post({ url: self.urls.reviewRequest, form: compositeRequestData }, function(err, req, txt){
        if (err)  return callback(err);
        if (!txt) return callback({reason: "An unknown error occurred."})

        // @TODO - Parse response text here to determine if
        // verification is correct
        callback(err, txt);
    })
},


/**
 * Submits the request
 */
Request.prototype.submit = function(callback) {
    var self = this;
    self.req.post({url: urls.submitRequest, form: {}}, callback);
}

module.exports = Request;



//********************************
// PRIVATE MODULE METHODS
//********************************


/**
 * Private static method to generate request-type-specific urls
 */
function generateUrls(type) {

    var urls = {
        reset: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=locform",
        setLocation: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=locvalidate",
        selectService: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=csrform",
        reviewRequest: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=review",
        submitRequest: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=csrupdate"
    }

    var typeString = "&invSRType=";
    typeString += type;
    typeString += "&invSRDesc=" + encodeURIComponent(module.requestTypes[type]);

    urls.setLocation += typeString;
    urls.reset += typeString;
    urls.reset += "&locreq=Y&stnumreqd=Y";
    return urls;
}



/**
 * Private static method to get yaml-defined field definitions
 */
function getFieldDefinitions(type) {
  type = type.toUpperCase();
    if (!_.contains(_.keys(module.requestTypes), type)) {
        throw new Error("Non-existent request type: " + type);
    }

    var path = __dirname + "/../data/request-type-definitions/" + type + ".yml";
    try {
        var yml = fs.readFileSync(path);
        return yaml.safeLoad(yml);
    } catch (e) {
        throw new Error("Request type '" + type + "' has not been implemented yet.    See the module README for instructions for implementing it yourself");
    }
}

/**
 * Validates user-submitted data against the YAML-defined form definitions
 *
 * @param data {object} - user-submitted data
 * @param fieldDefinitions {object} - the form field definitions defined in the request type's YAML file
 * @returns {mixed} true if valid or object containing errors if not.
 */
function validateFormData(data, fieldDefinitions) {
    var invalid = false;
    var errorObj = { invalid: true, errors: {} };

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

/**
 * Validates user-submitted contact data
 *
 * @param data {object} - User submitted contact data
 * @returns {mixed} - true if valid or object containing errors if not.
 */
function validateContactData(data) {
    var invalid = false;
    var errorObj = { invalid: true, errors: {} };

    if (!utilFuncs.isEmail(data.emailAddress)) {
        invalid = true;
        errorObj.errors.emailAddress = "That email address does not appear to be valid"
    }

    if (!data.emailAddress) {
        invalid = true;
        errorObj.errors.emailAddress = "Email Address (emailAddress) is required"
    }

    _.each(["phone1", "phone2", "phone3"], function(key){
        var normalized = utilFuncs.normalizePhone(data[key])
        if (data[key] && !normalized) {
            invalid = true;
            errorObj.errors[key] = key + " does not appear to be a valid phone number"
        }
    })

    return (invalid) ? errorObj : true;
}

/**
 * Parses markup for form fields and returns an object
 * of key/value pairs
 */
function getFormDataFromMarkup(text) {
  var returnObj = {};
  var $ = cheerio.load(text);
  var $inputs = $("select, input, textarea");
  $inputs.each(function(idx, el){
    var key = $(el).attr('name');
    if (key) {
      returnObj[key] = $(el).val();
    }
  })

  return returnObj;
}



/**
 * Maps user-friendly parameter names to the 311-specific form input names
 * required by the city's website
 *
 * @param data {object} - key-value pairs of request data
 * @param requestType {string} - the request type to generate for
 *
 * @returns {object} - key-value pairs using the appropriate keys for form submission
 */
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
    _.each(data, function(val, key){
        var chiKey = fieldMap[key];
        convertedData[chiKey] = val;
    })

    if (data.phone1 && data.textUpdates) {
        convertedData["fn_" + requestType + "_A511OPTN"] = data.phone1;
    }

    return convertedData;
}
