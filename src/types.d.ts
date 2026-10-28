interface PdvBridge {
  list(kind: string, search?: string): Promise<Record<string, any>[]>;
  save(kind: string, record: Record<string, any>): Promise<Record<string, any>>;
  archive(kind: string, id: string): Promise<{id:string; archived:boolean}>;
  overview(): Promise<Record<string, number>>;
}
interface Window { pdv?: PdvBridge }
