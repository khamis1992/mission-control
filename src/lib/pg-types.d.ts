declare module 'pg' {
  export class Client {
    constructor(config: any);
    connect(): Promise<void>;
    query(query: string, params?: any[]): Promise<{ rows: any[] }>;
    end(): Promise<void>;
  }
}
