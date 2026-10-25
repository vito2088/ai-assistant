export const featureGroups = [
  { id: 'ai', label: 'AI', children: [{ id: 'aiChat', label: 'AI 聊天与内容助手' }] },
  { id: 'document', label: '文档', children: [{ id: 'todo', label: '待办' }, { id: 'note', label: '速记' }] },
  { id: 'workbench', label: '工作台', children: [{ id: 'project', label: '项目' }, { id: 'app', label: '应用' }] },
  { id: 'tools', label: '工具', children: [{ id: 'screenshot', label: '截图' }, { id: 'recording', label: '录屏' }, { id: 'calculator', label: '计算器' }] },
] as const;

export type FeatureGroup = typeof featureGroups[number]['id'];
export type Feature = typeof featureGroups[number]['children'][number]['id'];
export type FeatureVisibility = Record<Feature, boolean>;
export type FeaturePage = FeatureGroup | 'settings';

export function parseVisibility(saved: string | null): FeatureVisibility {
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(saved ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) value = parsed as Record<string, unknown>;
  } catch { /* Missing or damaged preferences keep all features available. */ }
  return Object.fromEntries(featureGroups.flatMap(group => group.children.map(child =>
    [child.id, typeof value[child.id] === 'boolean' ? value[child.id] : true],
  ))) as FeatureVisibility;
}

export function groupState(visibility: FeatureVisibility, id: FeatureGroup) {
  const children = featureGroups.find(group => group.id === id)!.children;
  const count = children.filter(child => visibility[child.id]).length;
  return { checked: count === children.length, partial: count > 0 && count < children.length, visible: count > 0 };
}

export function setFeatureVisible(visibility: FeatureVisibility, id: string, checked: boolean): FeatureVisibility {
  const next = { ...visibility };
  const group = featureGroups.find(group => group.id === id);
  if (group) for (const child of group.children) next[child.id] = checked;
  else if (Object.hasOwn(next, id)) next[id as Feature] = checked;
  return next;
}

export function visiblePages(visibility: FeatureVisibility): FeaturePage[] {
  return [...featureGroups.filter(group => groupState(visibility, group.id).visible).map(group => group.id), 'settings'];
}

export function availablePage(visibility: FeatureVisibility, current: FeaturePage): FeaturePage {
  const pages = visiblePages(visibility);
  return pages.includes(current) ? current : pages[0];
}
