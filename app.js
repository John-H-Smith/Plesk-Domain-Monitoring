'use strict';
const conf = require( './config' );
var nodemailer = require( 'nodemailer' );
const requests = require( 'request' );
const fs = require( 'fs' );
const { date } = require('assert-plus');

var transporter = nodemailer.createTransport( {
    host: conf.sender_mail.host,
    secure: true,
    auth: {
        user: conf.sender_mail.user,
        pass: conf.sender_mail.pass
    },
    tls:{
        rejectUnauthorized: false
    }
});

let errorMessage = '';
let errorUrls = [];
let pleskError = false;

setInterval( async () => {
    requests({
        url: 'https://' + conf.plesk_host.hostname + ':8443/api/v2/domains',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + conf.plesk_host.login_data
        }
    }, (error, response, domains) => {

        if( error ) {
            pleskError = true;
            return;
        }

        pleskError = false;
        domains = JSON.parse( domains );
        errorMessage = "";

        domains.forEach( domain => {
            if( domain.hosting_type != "virtual" || domain.name.includes('*') )
                return;

            requests({
                url: 'https://' + domain.name,
            }, (error2, response2, body) => {

                if( error2 ) {
                    errorUrls.push( { statusCode: -1, domain: domain.name } );
                    return;
                }

                if(response2 != null)
                    if(response2.statusCode != 200 && !conf.whitelisted_urls.includes(domain.name))
                        errorUrls.push( { statusCode: response2.statusCode, domain: domain.name } );
            });
        });

    });
    sendMail();
}, 1000 * 60 * conf.period );



function sendMail() {

    let msg = '';
    if( !pleskError )
        msg = conf.receiver_mail.message_begin + '<br /><br />';
    else {
        msg = "Error connecting to plesk REST API!";
        fs.appendFile( 'error_log.txt', msg + '\n', () => {} );
    }

    if( errorUrls.length == 0 && !pleskError )
        return;

    let date = (new Date()).getFullYear() + '-' + ((new Date()).getMonth() + 1) + '-' + (new Date()).getDate() + ' ' + (new Date()).getHours() + ':' + (new Date()).getMinutes() + ':' + (new Date()).getSeconds();

    errorUrls.forEach( error => {
        if( error.statusCode === -1)
            error.statusCode = 'Error fetching';

        msg += '<span style="color: red">' + error.statusCode + '</span> <a href="https://' + error.domain + '">https://' + error.domain + '</a><br />';
        fs.appendFile( 'monitoring_log.txt', date + " - " + error.statusCode + " " + error.domain + '\n', () => {} );
    });

    var mailOptions = {
        from: conf.sender_mail.user,
        to: conf.receiver_mail.address,
        subject: conf.receiver_mail.subject,
        html: msg
    };
    transporter.sendMail( mailOptions, (error, info) => {
        if ( error )
            fs.appendFile( 'error_log.txt', date + " - " + error + '\n', () => {} );
    });
    errorUrls = [];
}