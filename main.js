const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const yargs = require('yargs');
const xml2js = require('xml2js').parseString;
const package = require('./package.json');

// Args and help
const argv = yargs.scriptName("node " + path.basename(__filename)).usage('$0 <file>', package.description, (yargs) => {
	yargs.positional('file', {
		desc: 'a Premiere Pro .prproj file',
		normalize: true,
		type: 'string'
	});
}).help().argv;

// Load and parse an XML file (promise)
const loadXmlFile = async (filepath) => {
	return new Promise(async (resolve, reject) => {
		try {
			resolve(await parseXml(fs.readFileSync(filepath).toString()));
		} catch (x) {
			reject('Cannot load project file\n' + x.toString());
		}
	});
};

// Parse an XML string (promise)
const parseXml = async (xml) => {
	return new Promise((resolve, reject) => {
		xml2js(xml, (err, result) => err ? reject('Invalid XML string') : resolve(result));
	});
};

// Main entry point (async)
(async () => {
	
	try {
		
		// The project file is a plain XML file
		const project = await loadXmlFile(argv.file);
		if (!project.PremiereData) throw 'Invalid Premiere Pro project file';
		
		// Search for titles in <Media> nodes
		const titles = [];
		for (const media of (project.PremiereData.Media || [])) {
			
			// Search for a <ImporterPrefs Encoding="base64" /> child
			if (media.ImporterPrefs && media.ImporterPrefs[0]) {
				const dataNode = media.ImporterPrefs[0];
				if (dataNode.$ && dataNode.$.Encoding == 'base64' && dataNode._) {
					try {
						const data = Buffer.from(dataNode._, 'base64'); // Raw data is encoded in base64 in the node text content
						if (data.toString().indexOf('CompressedTitle') > 0) { // Ensure raw data contains the "CompressedTitle" string in the header
							const dataPayload = data.slice(0x20); // Remove the header to retrieve the zlib compressed payload
							const title = zlib.inflateSync(dataPayload); // De-compress the payload
							if (title) titles.push(title); // Got the title!
						}
					} catch (w) {
						console.warn("Warning: unexpected title data format, skipping\n -> " + w.toString());
					}
				}
			}
			
		}
		
		if (titles.length == 0) throw 'There is no title in this Premiere Pro project';
		
		// Save found titles as XML files
		for (let i = 0; i < titles.length; i++) {
			fs.writeFileSync(argv.file + '-title-' + (i + 1).toString().padStart(3, '0') + '.xml', titles[i]);
		}
		
		console.log('Done! ' + titles.length + ' titles has been saved as XML files next to your project file');
		
	} catch (x) {
		console.error('Error: ' + x.toString());
	}
	
})();