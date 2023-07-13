import { MobilettoConnection } from "mobiletto-base";
import { MobilettoOrmIdArg, MobilettoOrmObject, MobilettoOrmTypeDef } from "mobiletto-orm-typedef";
import { MobilettoOrmCurrentArg, MobilettoOrmPredicate, MobilettoOrmRepository, MobilettoOrmStorageResolver } from "./types.js";
export declare const resolveStorages: (stores: MobilettoConnection[] | MobilettoOrmStorageResolver) => Promise<MobilettoConnection[]>;
export declare const parseCurrent: (current: MobilettoOrmCurrentArg) => string;
export declare const findVersion: (repository: MobilettoOrmRepository, id: MobilettoOrmIdArg, current?: MobilettoOrmCurrentArg) => Promise<MobilettoOrmObject>;
export declare const includeRemovedThing: (includeRemoved: boolean, thing: MobilettoOrmObject) => boolean;
export declare const verifyWrite: (repository: MobilettoOrmRepository, storages: MobilettoConnection[], typeDef: MobilettoOrmTypeDef, id: string, obj: MobilettoOrmObject, removedObj?: MobilettoOrmObject) => Promise<MobilettoOrmObject>;
export type MobilettoFoundMarker = {
    found: boolean;
};
export declare const promiseFindById: (repository: MobilettoOrmRepository, storage: MobilettoConnection, field: string, value: any, id: string, exists: boolean, first: boolean, removed: boolean, noRedact: boolean, predicate: MobilettoOrmPredicate | null, found: Record<string, MobilettoOrmObject | null>, addedAnything: MobilettoFoundMarker) => Promise<string>;
