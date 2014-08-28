var fs = require("fs"), path = require("path");
var createCallback = require("create-callback"),
	createCallbackSet = require("callback-set");
var isDir = require("isDirectory");
var render = require("./render.js");

var args = process.argv;
if (args.length < 4) {
	console.log("Must specify source path and destination path, or source and the auto-destination flag.");
}
else {
	var source = path.normalize(args[2]), dest = args[3], auto = (dest==="-a");
	if(auto){
		isDir(args[2], function(isDir) {
			if(!isDir){
				console.log("Source path is not a directory.");
			}
			else{
				dest = source;
				start();
			}
		});
	}
	else{
		var checkSet = createCallbackSet(function(fail) {
			if(!fail){
				start();
			}
		});

		isDir(source, checkSet.add(function(isDir) {
			if(!isDir){
				console.log("Source path is not a directory.");
				checkSet.fail();
			}
			else{checkSet.resolve();}
		}));
		isDir(dest, checkSet.add(function(isDir){
			if(!isDir){
				console.log("Destination path is not a directory.");
				checkSet.fail();
			}
			else{
				dest = path.normalize(dest);
				checkSet.resolve();
			}
		}));
	}
	
	var start = (function() {
		var failed = false;
		var checking = 0, checked = 0;
		function checkDone(){
			if(++checked === checking){
				console.log("Rendering "+toRender.length+" files...");
			}
		}
		
		var toRender = [];
		
		function start(){
			console.log(JSON.stringify(source)+" -> "+JSON.stringify(dest)+(auto?" (auto)":""));
			checking++;
			startSub(source, dest);
		}
		function startSub(source, dest){
			var c = createCallback();
			c.sourcePath = source;
			c.destPath = dest;
			c.ondispose = function(){
				delete c.sub;
				delete c.sourcePath;
				delete c.destPath;
			};
			
			fs.exists(c.destPath, c.setAction(destSubExists));
		}
		
		function destSubExists(exists, c) {
			if(failed){c.dispose(); return;}
			
			if(exists){
				fs.stat(c.destPath, c.setAction(destSubIsDir));
			}
			else{
				fs.mkdir(c.destPath, c.setAction(makeDestSub));
			}
		}
		function destSubIsDir(error, stat, c){
			if(failed){c.dispose(); return;}
			
			if(error){
				console.log("Could not fs.stat destination sub path "+JSON.stringify(c.destPath)+":",error);
				checkDone(); c.dispose(); failed = true;
			}
			else if(stat.isDirectory()){
				startSubScan(c);
			}
			else{
				console.log("Destination sub path exists, but is not a directory.");
				checkDone(); c.dispose(); failed = true;
			}
		}
		function makeDestSub(error, c){
			if (failed) { c.dispose(); return; }
			
			if(err){
				console.log("Could not fs.mkdir destination sub path "+JSON.stringify(c.destPath)+":", error);
				checkDone(); c.dispose(); failed = true;
			}
			else{
				startSubScan(c);
			}
		}
		
		function startSubScan(c){
			if (failed) { c.dispose(); return; }
			
			fs.readdir(c.sourcePath, c.setAction(startSubFiles));
		}
		function startSubFiles(error, files, c){
			if (failed) { c.dispose(); return; }
			
			if(error){
				console.log("Could not fs.readdir "+JSON.stringify(c.sourcePath)+":", error);
				checkDone(); c.dispose(); failed = true;
			}
			else if(files.length){
				for(var i=0, l=files.length; i<l; i++){
					var cf = createCallback();
					cf.sourceFile = path.join(c.sourcePath, files[i]);
					cf.destFile = path.join(c.destPath, files[i]);
					cf.ondispose = function(){
						delete cf.sourceFile;
						delete cf.destFile;
					};
					
					checking++;
					fs.stat(cf.sourceFile, cf.setAction(checkSourceFile));
				}
				checkDone(); c.dispose();
			}
		}
		var isSrc = /\.src$/;
		function checkSourceFile(error, stat, cf){
			if (failed) { cf.dispose(); return; }
			
			if(error){checkDone();}
			else if(stat.isDirectory()){
				checking++; checkDone();
				startSub(source, dest);
			}
			else if(stat.isFile() && isSrc.test(cf.sourceFile)){
				cf.destFile = cf.destFile.substring(0,cf.destFile.length-4)+".html";
				checking++; checkDone();
				fs.exists(cf.destFile, cf.setAction(destFileExists));
			}
			else{
				checkDone(); cf.dispose();
			}
		}
		function destFileExists(exists, cf){
			if (failed) { cf.dispose(); return; }
			
			if(exists){
				fs.stat(cf.destFile, destFileStat);
			}
			else{
				toRender.push([cf.sourceFile, cf.destFile]);
				checkDone(); cf.dispose();
			}
		}
		
		function destFileStat(error, stat, cf){
			if (failed) { cf.dispose(); return; }
			
			if(error){
				console.log("Could not fs.stat "+JSON.stringify(cf.destFile)+".");
				checkDone(); cf.dispose(); failed = true;
			}
			else if(stat.isFile()){
				toRender.push([cf.sourceFile, cf.destFile]);
				checkDone(); cf.dispose();
			}
			else{
				console.log("Could not write to "+JSON.stringify(cf.destFile)+"; path exists, and is not a file");
				checkDone(); cf.dispose(); failed = true;
			}
		}

		return start;
	})();
}
