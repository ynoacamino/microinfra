export interface AdapterDefinition<Name extends string, TPort> {
  name: Name;
  port: TPort;
  isConfigured?: () => boolean;
}

export function defineAdapter<const Name extends string, TPort>(
  def: AdapterDefinition<Name, TPort>,
): AdapterDefinition<Name, TPort> {
  return def;
}
