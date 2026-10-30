export type TerminalProfile = {id:string;name:string;kind:'local'|'ssh';shell:string;cwd:string;host:string;port:number;username:string;auth:'password'|'key';keyPath:string;group:string;environment:''|'development'|'test'|'production'};
export type TerminalPreferences = {fontSize:number;scrollback:number;theme:'dark'|'light'};
export type RemoteEntry = {name:string;path:string;directory:boolean;symlink:boolean;size:number;modified:number|null};
export const defaultTerminalPreferences:TerminalPreferences={fontSize:13,scrollback:3000,theme:'dark'};
export function terminalLoadError(message:string){return /\bcommand\s+terminal_load\s+not found\b/i.test(message)?'应用界面与运行版本不一致，请完全退出并重新启动小助手。':message;}
export const newTerminalProfile=(kind:'local'|'ssh',shell='powershell'):TerminalProfile=>({id:'',name:'',kind,shell:kind==='local'?shell:'',cwd:'',host:'',port:22,username:'',auth:'password',keyPath:'',group:'',environment:''});
export function remoteJoin(dir:string,name:string){if(!name||name==='.'||name==='..'||/[\/\\\r\n\0]/.test(name))throw new Error('文件名称无效');return `${dir.replace(/\/+$/,'')}/${name}`;}
export function remoteParent(dir:string){const clean=dir.replace(/\/+$/,'');return clean.slice(0,clean.lastIndexOf('/'))||'/';}
export function formatBytes(size:number){if(!Number.isFinite(size)||size<0)return '—';if(size<1024)return `${size} B`;const i=Math.min(3,Math.floor(Math.log(size)/Math.log(1024)));return `${(size/1024**i).toFixed(size<1024**(i+1)/10?1:0)} ${['B','KB','MB','GB'][i]}`;}
export function terminalPreferences(value:Partial<TerminalPreferences>):TerminalPreferences{return {fontSize:Number.isInteger(value.fontSize)&&value.fontSize!>=10&&value.fontSize!<=24?value.fontSize!:13,scrollback:Number.isInteger(value.scrollback)&&value.scrollback!>=500&&value.scrollback!<=10000?value.scrollback!:3000,theme:value.theme==='light'?'light':'dark'};}
export function* terminalInputChunks(data:string){for(let start=0;start<data.length;){let end=Math.min(start+8192,data.length);if(end<data.length&&data.charCodeAt(end-1)>=0xd800&&data.charCodeAt(end-1)<=0xdbff)end--;yield data.slice(start,end);start=end;}}
