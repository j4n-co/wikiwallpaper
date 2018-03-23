const request = require('request-promise-native');
const Jimp = require('jimp');
const xml2js = require('xml2js').parseString;
const MWTitle = require( 'mediawiki-title' );
const SiteInfo = require('./siteinfo.json');
const font = Jimp.loadFont( Jimp.FONT_SANS_32_WHITE )

function getParams( title, size ){
    function getMwTitle( title ) {
        return MWTitle.Title.newFromText( title, SiteInfo, 6 ).getKey();
    }
    function getWidth( size ) {
        return parseInt( size.split('x')[0], 10 ) || 800;
    }
    function getHeight( size ) {
        return parseInt( size.split('x')[1], 10 ) || 800;
    }
    function fileInfoUrl( title ) {
        return `https://tools.wmflabs.org/magnus-toolserver/commonsapi.php?image=${getMwTitle( title )}`;
    }
    return {
        title: getMwTitle( title ),
        width: getWidth( size ),
        height: getHeight( size),
        fileInfoUrl: fileInfoUrl( title )
    }
}

function measureText(font, text) {
    var x = 0;
    for (var i = 0; i < text.length; i++) {
        if (font.chars[text[i]]) {
            x += font.chars[text[i]].xoffset
                + (font.kernings[text[i]] && font.kernings[text[i]][text[i + 1]] ? font.kernings[text[i]][text[i + 1]] : 0)
                + (font.chars[text[i]].xadvance || 0);
        }
    }
    return x;
};

function parseFileInfo( response ) {
    let fileInfo;
    xml2js(response, function (err, result) {
        fileInfo = {
            name: result.response.file[0].name[0],
            author: result.response.file[0].uploader[0],
            license: result.response.licenses[0].license[0].name[0],
            description: result.response.file[0].urls[0].description[0],
            url: result.response.file[0].urls[0].file[0]
        }
    });
    return fileInfo;
}

function getFileInfo( fetchUrl ) {
    return request( {
        url: fetchUrl,
        headers: {
            'User-Agent': 'JDrewniak (WMF) / playing around with Commons images.'
        }
    })
    .then( parseFileInfo );
};


function getFileData( fileInfo ) {
    return request( {
        url: fileInfo.url,
        encoding: null
    } )
    .then( body => {
        fileInfo.data = body
        return fileInfo;
    })
};

function createJimpImg( fileInfo ) {
    return Jimp.read( fileInfo.data )
}

function createWallpaper( fileInfo, jimpImg, font, wordmark, params ) {

    return Promise.all( [ fileInfo, jimpImg, font, wordmark ] )
        .then( values => {
            var  [fileInfo, jimpImg, font, wordmark] = values;
            var textLine = ( text, bottom ) => {
                txtObj = {};
                txtObj.text = text;
                txtObj.x = ( params.width / 2 ) - ( measureText(font, txtObj.text ) / 2 );
                txtObj.y =  params.height - bottom;
                return txtObj;
            };

            var line1 = textLine( fileInfo.name + ' - ' + fileInfo.author, 150 );
            var line2 = textLine( fileInfo.license + ' - ' + fileInfo.description, 100 );

            return jimpImg
                .cover( params.width, params.height )
                .composite( wordmark,  (params.width/2) - (wordmark.bitmap.width/2), (params.height/2) - (wordmark.bitmap.height/2) )
                .print(font, line1.x, line1.y, line1.text)
                .print(font, line2.x, line2.y, line2.text)
                .write(`./${fileInfo.name}.jpg`);
        } )
        .catch(function (err) {
            console.log(err)
        });
}



function init(req, res) {
    // const params = getParams( '2009-04-18-noerdlingen-rr-14.jpg', '2560x1600');
    const params = getParams( req.body.title, req.body.size);
    const fileInfo = getFileInfo( params.fileInfoUrl ).then( getFileData )
    const jimpImg = fileInfo.then( createJimpImg );
    const wordmark = Jimp.read('./wikimedia_logo.png')
                        .then( img => img.contain( params.width / 4, params.height / 4 ) );

    const wallpaper = createWallpaper( fileInfo, jimpImg, font, wordmark, params );
    return wallpaper;
    // res.status(200).send(wallpaper);
};

exports.init = init;
