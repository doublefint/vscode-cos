const fs = require("fs");
const path = require("path");
//export 'mypkg.subpkg.name.cls' as /mypkg/subpkg/name.cls
const asAtelier = require("./doc-to-file-as-atelier");
const mkdir = require("./mkdir-p-sync"); // mkdir -p 'path/to/file'

// see module.exports
let api = {
  getDocNames: (opts, cb) => cb(null, {}),
  getDoc: (docname, cb) => cb(null, {})
};

// see module.exports
let log = (...msg) => console.log("cos.export:", ...msg);
// export options
let root = ".";
let folder = "src";
let atelier = false;
let doc2file = docname => docname;
let noStorage = false;
let dontExportIfNoChanges = false;

// Export one document
const ExportDoc = (doc, next) => ({ error, data }) => {
  if (error) {
    log(`${JSON.stringify(error)}\n`);
    return;
  }

  const { content, status } = data.result;

  // atelier: 'mypkg.subpkg.myclass.cls' => 'mypkg/subpkg/myclass.cls'
  const filename = doc2file(doc.name);
  const fullname =
    doc.fileName || [root, folder, doc.cat, filename].join(path.sep);
  const folders = path.dirname(fullname);

  let contentLen = content.length;
  
  const promise = new Promise((resolve, reject) => {
    if(noStorage) {
      // get only the storage xml for the doc.
      api.getDoc(encodeURI(doc.name)+'?storageOnly=1', (storageError, storageData) => {
        if(storageError) {
          log(`${JSON.stringify(storageError)}\n`);
          reject(storageError);
          return;
        }
        const storageContent = storageData.result.content;
        
        if(storageContent.length>1 && storageContent[0]) {
          const storageContentString = storageContent.join("\n");
          const contentString = content.join("\n");
          
          // find and replace the docs storage section with ''
          resolve({'found': contentString.indexOf(storageContentString) >= 0,  'content': contentString.replace(storageContentString, '')});
        } else {
          resolve({'found': false});
        }
      });
    }else{
      resolve({'found': false});
    }
  });
  promise.then((res:any) => {
    let joinedContent = (content || []).join("\n").toString('utf8');
    let isSkipped = '';

    if(res.found) {
      joinedContent = res.content.toString('utf8');
    }

    if (!fs.existsSync(folders)) mkdir(folders);
    if (dontExportIfNoChanges && fs.existsSync(fullname)) {
      const existingContent = fs.readFileSync(fullname, "utf8");
      // stringify to harmonise the text encoding.
      if (JSON.stringify(joinedContent) != JSON.stringify(existingContent)) {
        fs.writeFileSync(fullname, joinedContent);
      } else {
        isSkipped = 'skipped - no changes.';
      }
    } else {
      fs.writeFileSync(fullname, joinedContent);
    }
    
    log(`${doc.name} -> ${fullname}. ${status} ${isSkipped}`);
    if (next && typeof next === "function") next();
  });
  
};

const doclist = ({ error, data }) => {
  if (error) return log(`DOCLIST: ${JSON.stringify(error)}`);
  const list = data.result.content;
  log(`Documents on server: ${list.length}`);

  const docfilter = d =>
    d.name.substring(0, 1) !== "%" &&
    d.cat !== "CSP" &&
    d.name.substring(0, 12) !== "INFORMATION.";

  const filtered = list.filter(docfilter);
  log(`Without CSP, %* and INFORMATION.*: ${filtered.length}`);

  const next = () => {
    let doc = filtered.shift();
    if (!doc) {
      log("Export completed.\n");
      return;
    }
    let cb = ExportDoc(doc, next);
    api.getDoc(encodeURI(doc.name), (error, data) => cb({ error, data }));
  };
  next();
};

/**
 * Export all classes/routines in a namespace to working directory.
 */
module.exports = env => {
  let category, generated, filter;
  //reassign module variables
  const init = () => {
    let options;
    ({ api, log, options } = env); //env - environment
    ({ root, folder, atelier, category, generated, filter, noStorage, dontExportIfNoChanges } = options());
    doc2file = atelier ? asAtelier : doc => doc;
  };
  init();

  const exportAll = () => {
    if (!root) {
      log(`COS.EXPORT: Open folder before export - Ctrl+K, Ctrl+O`);
      return;
    }

    init();

    log("\nLoad documents list ...");
    api.getDocNames(
      { category, generated, filter }, //doclist options
      (error, data) => doclist({ error, data }) //callback wrapper
    );
  };

  return { exportAll, ExportDoc };
};
