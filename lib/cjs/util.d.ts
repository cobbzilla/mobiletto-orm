import { MobilettoConnection } from "mobiletto-base";
import { MobilettoOrmIdArg, MobilettoOrmObject, MobilettoOrmTypeDef } from "mobiletto-orm-typedef";
import { MobilettoOrmCurrentVersionArg, MobilettoOrmPredicate, MobilettoOrmRepository, MobilettoOrmStorageResolver } from "./types.js";
export declare const resolveStorages: (stores: MobilettoConnection[] | MobilettoOrmStorageResolver) => Promise<MobilettoConnection[]>;
export declare const parseVersion: <T extends MobilettoOrmObject>(repository: MobilettoOrmRepository<T>, current: MobilettoOrmCurrentVersionArg) => string;
export declare const safeParseVersion: <T extends MobilettoOrmObject>(repository: MobilettoOrmRepository<T>, current: MobilettoOrmCurrentVersionArg, defaultValue: string) => string;
export declare const findVersion: <T extends MobilettoOrmObject>(repository: MobilettoOrmRepository<T>, id: MobilettoOrmIdArg, current?: MobilettoOrmCurrentVersionArg) => Promise<T>;
export declare const includeRemovedThing: (includeRemoved: boolean, thing: MobilettoOrmObject) => boolean;
export declare const verifyWrite: <T extends MobilettoOrmObject>(repository: MobilettoOrmRepository<T>, storages: MobilettoConnection[] | MobilettoOrmStorageResolver, typeDef: MobilettoOrmTypeDef, id: string, obj: MobilettoOrmObject, removedObj?: MobilettoOrmObject) => Promise<MobilettoOrmObject>;
export type MobilettoFoundMarker = {
    found: boolean;
};
export declare const promiseFindById: <T extends MobilettoOrmObject>(repository: MobilettoOrmRepository<T>, storage: MobilettoConnection, field: string, value: any, id: string, first: boolean, removed: boolean, noRedact: boolean, predicate: MobilettoOrmPredicate | null, found: Record<string, MobilettoOrmObject | null>, addedAnything: MobilettoFoundMarker) => Promise<string>;
