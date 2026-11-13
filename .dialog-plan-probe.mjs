import { normalizeComponentFields } from './src/ai/system-prompt.js';
import { aemFiles } from './src/data/implementations/aem.js';
import { convertSourceProjectPlanToInstancePlan } from './src/aem/instance-only-plan.js';
const fields = normalizeComponentFields([{name:'tabs',label:'Tabs',type:'multifield',composite:true,children:[
{name:'tabTitle',label:'Tab title',type:'text',required:true},
{name:'tabUrl',label:'Tab URL',type:'path',rootPath:'/content'},
{name:'links',label:'Links',type:'multifield',composite:true,children:[{name:'linkTitle',label:'Link title',type:'text'}]}
]}]);
const files = aemFiles('Dynamic Navigation', fields, 'Create a dynamic navigation');
const dialog = files.find(f=>f.name.endsWith('/_cq_dialog/.content.xml'));
const converted = convertSourceProjectPlanToInstancePlan({title:'probe',summary:'probe',fileChanges:[{path:dialog.name,action:'create',content:dialog.code}]});
console.log('DIALOG FILE',dialog.name,dialog.code.slice(0,1600));
console.log('WARNINGS',JSON.stringify(converted.warnings));
console.log('OPS',JSON.stringify(converted.plan.repositoryOperations.map(op=>({type:op.type,path:op.path,primaryType:op.primaryType,properties:op.properties})),null,2));
