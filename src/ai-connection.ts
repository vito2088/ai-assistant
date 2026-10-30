import { t } from './i18n';

const reasons:Record<string,string>={
  configuration:'请检查服务地址和当前选中的实际模型。',
  glmProtocol:'这个智谱地址是 Anthropic/Responses 通道，请选择智谱 Coding Plan 预设的 Chat Completions 地址。',
  credentials:'请填写当前地址的 API 密钥；更换地址后不能沿用其他地址的已保存密钥。',
  authentication:'服务认证失败，请核对该通道对应的密钥及账号权限。',
  balance:'当前 API 通道余额不足；如果使用 Coding Plan，请选择套餐专用地址。',
  quota:'当前账号或套餐额度已用完，请检查额度与重置时间。',
  expired:'Coding Plan 套餐已到期，请检查套餐状态。',
  model:'模型不存在或当前账号无权使用，请检查实际模型 ID。',
  endpoint:'服务地址或协议不匹配，请使用 Chat Completions 兼容地址。',
  parameters:'服务拒绝了测试参数，请核对模型及接口兼容性。',
  response:'服务已响应，但没有返回有效文本；请检查模型或接口协议。',
  timeout:'连接测试超过 45 秒，请检查网络或稍后重试。',
  network:'无法连接模型服务，请检查网络、代理和服务地址。',
  provider:'模型服务暂时不可用，请稍后重试。',
  cancelled:'连接测试已取消',
};
export function connectionError(error:unknown):string {
  if(typeof error==='string')return t(error);
  if(!error||typeof error!=='object')return t(reasons.provider);
  const value=error as {kind?:string;detail?:string;status?:number;code?:string};
  const parts=[t(reasons[value.kind??'']??reasons.provider)];
  if(value.kind==='configuration'&&typeof value.detail==='string')parts.push(t(value.detail));
  if(typeof value.status==='number'&&Number.isInteger(value.status)&&value.status>=100&&value.status<=599)parts.push(`HTTP ${value.status}`);
  if(value.code)parts.push(t('服务错误码：{0}',[value.code]));
  return parts.join('；');
}
