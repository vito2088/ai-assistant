import { featureGroups, type Feature, type FeatureGroup } from './feature-visibility';
export type FeatureOrder = { groups: FeatureGroup[]; children: Record<FeatureGroup, Feature[]> };
function complete<T extends string>(saved: unknown, known: readonly T[]): T[] {
  const valid = Array.isArray(saved) ? saved.filter((id): id is T => known.includes(id)) : [];
  return [...new Set([...valid, ...known])];
}
export function parseFeatureOrder(raw: string | null): FeatureOrder {
  let value: any = {};
  try { value = JSON.parse(raw ?? '{}') ?? {}; } catch { /* Restore default order. */ }
  return {
    groups: complete(value.groups, featureGroups.map(group=>group.id)),
    children: Object.fromEntries(featureGroups.map(group=>[group.id,complete(value.children?.[group.id],group.children.map(child=>child.id))])) as FeatureOrder['children'],
  };
}
export function orderedGroups(order: FeatureOrder) {
  return order.groups.map(id=>{
    const group = featureGroups.find(group=>group.id===id)!;
    return {id, label:group.label, children:order.children[id].map(id=>group.children.find(child=>child.id===id)!)};
  });
}
export function moveFeature(order: FeatureOrder, source: string, target: string, after = false): FeatureOrder {
  const next = structuredClone(order);
  const siblings: string[] | undefined = next.groups.includes(source as FeatureGroup) && next.groups.includes(target as FeatureGroup)
    ? next.groups : Object.values(next.children).find(ids=>ids.includes(source as Feature) && ids.includes(target as Feature));
  if (!siblings || source===target) return next;
  siblings.splice(siblings.indexOf(source),1);
  siblings.splice(siblings.indexOf(target)+(after?1:0),0,source);
  return next;
}
