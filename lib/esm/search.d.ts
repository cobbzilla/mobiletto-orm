import { MobilettoOrmObject, MobilettoOrmFindOpts, MobilettoOrmPredicate } from "mobiletto-orm-typedef";
import { MobilettoOrmRepository } from "./types.js";
export declare const search: <T extends MobilettoOrmObject>(repository: MobilettoOrmRepository<T>, storage: MobilettoOrmObject, searchPath: string, removed: boolean, noRedact: boolean, noCollect: boolean, predicate: MobilettoOrmPredicate, opts: MobilettoOrmFindOpts, promises: Promise<void>[], foundByHash: Record<string, T | null>, foundById: Record<string, T | null>) => Promise<void>;
