var src = {
	parseList: [
		/^-(?:([^|\n\r]+)\|)?([^\n\r]+)(?:[\n\r]+|$)/, // to-root, template
		/<!--[\W\w]*?(?:-->|$)/, // comment (allows unclosed)
		/((?:(?![\n\r])\s)*)(\[)?([#.])([^\s<>]+)>(?:[\n\r]+)?/, // value: start-collection, form, name
		/(<\/)(\])?(?:[\n\r]|$)/, // end value: collection
		/\s*(?:[\n\r]|$|(?=<\/))/, // whitespace
		/([\W\w]+?)(?=<\/[\r\n]|<!--|[\n\r]+[#.\[])/ // anything else (value data)
	]
}
var parseSrc = new RegExp(src.parseList.map(regexToSource).join("|"), "g");
var testSrc = new RegExp(
	regexToSource(src.parseList[0])+
	"(?:"+src.parseList.slice(1).map(regexToSource).join("|")+")*"+
	"$"
);
function regexToSource(regex) { return regex.source; }
//console.log(parseSrc.toString());

var fs = require("fs"), path = require("path"), util = require("util");

var templated = false, kill = false;
var srcDir, callback, srcData, current, error;
function render(dir, src, c) {
	if(!testSrc.test(src)){
		error = new Error("Invalid source.");
		if(c){c(error); return;}
		else{throw error;}
	}
	
	srcDir = dir;
	callback = c;
	error = null;
	
	var result = srcData = current = { hasProps: false };
	var found, lastIndex = -1, index = -1;
	while(found = parseSrc.exec(src)) {
		//console.log(found.slice(0), found.index, parseSrc.lastIndex);
		if((parseSrc.lastIndex > lastIndex) && (found.index > index)){
			lastIndex = parseSrc.lastIndex; index = found.index;
			srcParseMatch.apply(this, found);
			if (error) { break; }
		}
		else{
			break;
		}
	}

	if (!error && (current.parent || (current !== srcData))) {
		error = new Error("Last value close missing.");
	}

	delete srcData.hasProps;

	//*
	var maxLength = 200;
	console.log(JSON.stringify(srcData, function truncate(key, val) {
		if(key==="parent"){
			return "[parent]";
		}
		else if((typeof val === "string")&&(val.length>maxLength)){
			return val.substring(0,maxLength-3)+"...";
		}
		else{
			return val;
		}
	}, "  "));
	//*/
	
	if(error){
		if (callback) { callback(error); }
		else { throw error; }
	}
	
	// reset
	templated = kill = false;
	srcDir = ""; callback = srcData = current = error = null;
	
	return result;
}

var valueFind = /(\r?\n\t*)$|(^|\r?\n)(\t+)/g;
var indent;
function valueReplace(match, end, pre, tabs){
	return (
		end ? "" :
		(tabs.length >= indent + 1) ? match.substring(0, match.length - indent - 1) :
		pre
	);
}

function srcParseMatch(match,
	toRoot, template,
	value_indent, value_collection, value_form, value_name,
	end_value, end_collection,
	value_data
){
	if(!templated && !template){console.log("Could not find template in source.");}

	//console.log(arguments);

	var c = current;

	if (template) {
		if (toRoot) { srcData.base = toRoot; }
		
		templated = true;
		console.log("to load template: " +
			path.join(srcDir, srcData.base || "", template) + ".tmp"
		);
	}
	else if(value_name){
		if(value_collection){
			current = [];
		}
		else{
			current = { value: "" };
		}
		
		if(value_form==="."){
			if(Array.isArray(c)){
				current = { type: value_name };
				c.push(current);
			}
			else{
				return (error = new Error("Invalid placement of type-value; must be within a collection."));
			}
		}
		else{
			c.hasProps = true;
			c[value_name] = current;
		}
		
		current.hasProps = false;
		current.indent = value_indent.length;
		current.parent = c;
		
		//console.log("value>", [value_collection, value_form, value_name]);
	}
	else if(end_value){
		if(!current.parent){
			return (error = new Error("Mismatched value close."));
		}
		else{
			current = current.parent;
			
			if("value" in c){
				indent = c.indent;
				/*console.log(
					JSON.stringify(c.value) + " =>\n" +
					JSON.stringify(c.value.replace(valueFind, valueReplace))
				);*/
				c.value = c.value.replace(valueFind, valueReplace);
			}
			
			delete c.hasProps;
			delete c.parent;
			delete c.indent;
			
			//console.log("<value", [end_value, end_collection]);
		}
	}
	else if(value_data){
		if(current.hasProps){
			return (error = new Error("Value found for value with properties."));
		}
		else {
			current.value = (current.value ? current.value : "") + value_data;
		}
	}

	return match;
}

render("test", fs.readFileSync("test/sample.src", { encoding: "ascii" }));
