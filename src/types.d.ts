interface PdvBridge {
  list(kind: string, search?: string): Promise<Record<string, any>[]>;
  save(kind: string, record: Record<string, any>): Promise<Record<string, any>>;
  archive(kind: string, id: string): Promise<{id:string; archived:boolean}>;
  overview(): Promise<Record<string, number>>;
  sessionCurrent(): Promise<any>;
  sessionOpen(input: any): Promise<any>;
  sessionClose(input: any): Promise<any>;
  cashMove(input: any): Promise<any>;
  checkout(input: any): Promise<any>;
  salesList(): Promise<any[]>;
  saleGet(id: string): Promise<any>;
  salesCancel(id: string): Promise<any>;
  stockMove(input: any): Promise<any>;
  stockHistory(id?: string): Promise<any[]>;
  financeCreate(input: any): Promise<any>;
  financeList(): Promise<any[]>;
  financeSettle(input: any): Promise<any>;
  report(): Promise<any>;
  reportExport(format:'csv'|'pdf'|'xlsx'): Promise<{cancelled:boolean;format?:string}>;

}
interface Window { pdv?: PdvBridge }
