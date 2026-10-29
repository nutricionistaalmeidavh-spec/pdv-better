interface PdvBridge {
  list(kind: string, search?: string): Promise<Record<string, any>[]>;
  save(kind: string, record: Record<string, any>): Promise<Record<string, any>>;
  archive(kind: string, id: string): Promise<{id:string; archived:boolean}>;
  catalogCsvPreview(input:{csv:string}):Promise<{count:number;rows:any[]}>;
  catalogCsvImport(input:{csv:string}):Promise<{imported:number}>;
  overview(): Promise<Record<string, number>>;
  sessionCurrent(): Promise<any>;
  sessionOpen(input: any): Promise<any>;
  sessionClose(input: any): Promise<any>;
  cashMove(input: any): Promise<any>;
  checkout(input: any): Promise<any>;
  quoteSale(input: any): Promise<any>;
  salesList(): Promise<any[]>;
  saleGet(id: string): Promise<any>;
  salesCancel(id: string): Promise<any>;
  stockMove(input: any): Promise<any>;
  stockHistory(id?: string): Promise<any[]>;
  batchReceive(input: any): Promise<any>;
  batchesList(productId?: string): Promise<any[]>;
  promotionSet(input: any): Promise<any>;
  promotionsList(productId?: string): Promise<any[]>;
  bundleSet(input:any):Promise<any>;
  bundleList():Promise<any[]>;
  bundleArchive(id:string):Promise<any>;
  financeCreate(input: any): Promise<any>;
  financeList(): Promise<any[]>;
  financeSettle(input: any): Promise<any>;
  report(): Promise<any>;
  reportItems(filters?:any): Promise<any>;
  reportItemsExport(input:{format:'csv'|'pdf'|'xlsx';filters?:any}):Promise<{cancelled:boolean;format?:string}>;
  authStatus(): Promise<{setupRequired:boolean;operators:Array<{id:string;name:string;role:string}>}>;
  authBootstrap(input:{name:string;password:string}): Promise<{id:string;name:string;role:string}>;
  authLogin(input:{operatorId:string;password:string}): Promise<{id:string;name:string;role:string}>;
  authLogout(): Promise<any>;
  authSetPassword(input:{operatorId:string;password:string}): Promise<any>;
  sessionsList(): Promise<any[]>;
  lanStatus(): Promise<any>;
  lanHost(input: {port?:number}): Promise<any>;
  lanJoin(input: {address:string;secret:string}): Promise<any>;
  lanLocal(): Promise<any>;
  deviceGet(): Promise<any>;
  deviceSet(input: any): Promise<any>;
  devicePrinters(): Promise<Array<{name:string;displayName:string;isDefault:boolean}>>;
  devicePrint(input: any): Promise<any>;
  printQueueList(): Promise<any[]>;
  printQueueRetry(id:string): Promise<any>;
  printQueuePurge(): Promise<{removed:number}>;
  drawerOpen(): Promise<any>;
  scaleRead(): Promise<number>;
  backupCreate(): Promise<any>;
  backupRestore(): Promise<any>;

  reportExport(format:'csv'|'pdf'|'xlsx'): Promise<{cancelled:boolean;format?:string}>;

}
interface Window { pdv?: PdvBridge }
