import { MobilettoConnection } from "mobiletto-base";
import { MobilettoOrmIdArg, MobilettoOrmObject, MobilettoOrmTypeDef, MobilettoOrmValidationErrors } from "mobiletto-orm-typedef";
import { MobilettoOrmApplyFunc, MobilettoOrmFindOpts, MobilettoOrmPredicate, MobilettoOrmRepository, MobilettoOrmStorageResolver } from "./types.js";
export declare const resolveStorages: (stores: MobilettoConnection[] | MobilettoOrmStorageResolver) => Promise<MobilettoConnection[]>;
export declare const parseVersion: <T extends MobilettoOrmObject>(repository: MobilettoOrmRepository<T>, current: MobilettoOrmIdArg) => string;
export declare const safeParseVersion: <T extends MobilettoOrmObject>(repository: MobilettoOrmRepository<T>, current: MobilettoOrmIdArg, defaultValue: string) => string;
export declare const findVersion: <T extends MobilettoOrmObject>(repository: MobilettoOrmRepository<T>, id: MobilettoOrmIdArg, current?: MobilettoOrmIdArg) => Promise<T>;
export declare const includeRemovedThing: (includeRemoved: boolean, thing: MobilettoOrmObject) => boolean;
export declare const verifyWrite: <T extends MobilettoOrmObject>(repository: MobilettoOrmRepository<T>, storages: MobilettoConnection[] | MobilettoOrmStorageResolver, typeDef: MobilettoOrmTypeDef, id: string, obj: MobilettoOrmObject, previous?: MobilettoOrmObject) => Promise<MobilettoOrmObject>;
export type MobilettoFoundMarker = {
    found: boolean;
};
export declare const promiseFindById: <T extends MobilettoOrmObject>(repository: MobilettoOrmRepository<T>, storage: MobilettoConnection, field: string, value: any, id: string, first: boolean, removed: boolean, noRedact: boolean, predicate: MobilettoOrmPredicate | null, apply: MobilettoOrmApplyFunc | null, applyResults: Record<string, unknown> | null, noCollect: boolean, found: Record<string, MobilettoOrmObject | null>, addedAnything: MobilettoFoundMarker) => Promise<string>;
export declare const validateIndexes: <T extends MobilettoOrmObject>(repository: MobilettoOrmRepository<T>, thing: T, errors: MobilettoOrmValidationErrors) => Promise<void>;
export declare const redactAndApply: <T extends MobilettoOrmObject>(typeDef: MobilettoOrmTypeDef, thing: T, opts?: MobilettoOrmFindOpts) => Promise<T>;
