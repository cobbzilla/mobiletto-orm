import { MobilettoConnection, MobilettoMetadata } from "mobiletto-base";
import {
    MobilettoOrmIdArg,
    MobilettoOrmObject,
    MobilettoOrmTypeDef,
    MobilettoOrmTypeDefConfig,
} from "mobiletto-orm-typedef";

export type MobilettoOrmStorageResolver = () => Promise<MobilettoConnection[]>;

export type MobilettoOrmPredicate = (thing: MobilettoOrmObject) => boolean;

export type MobilettoOrmCurrentArg = null | undefined | MobilettoOrmObject | string;

export type MobilettoOrmFindOpts = {
    first?: boolean;
    removed?: boolean;
    noRedact?: boolean;
    predicate?: MobilettoOrmPredicate;
};

export const FIND_FIRST = { first: true };
export const FIND_REMOVED = { removed: true };
export const FIND_NOREDACT = { noRedact: true };

export type MobilettoOrmObjectInstance = {
    storage: MobilettoConnection;
    object: MobilettoOrmObject;
    name: string;
    data?: Buffer;
};

export type MobilettoOrmMetadata = MobilettoMetadata & {
    data?: Buffer;
    object?: MobilettoOrmObject;
};

export type MobilettoOrmRepository<T extends MobilettoOrmObject> = {
    typeDef: MobilettoOrmTypeDef;
    id: (thing: T) => string | null;
    idField: (thing: T) => string | null;
    validate: (thing: T, current?: T) => Promise<T>;
    create: (thing: T) => Promise<T>;
    update: (editedThing: T, current: MobilettoOrmCurrentArg) => Promise<T>;
    remove: (id: MobilettoOrmIdArg, current?: MobilettoOrmCurrentArg) => Promise<T>;
    purge: (idVal: MobilettoOrmIdArg) => Promise<unknown>;
    exists: (id: MobilettoOrmIdArg) => Promise<boolean>;
    resolveId: (idVal: MobilettoOrmIdArg, ctx?: string) => string | MobilettoOrmIdArg;
    findById: (idVal: MobilettoOrmIdArg, opts?: MobilettoOrmFindOpts) => Promise<T>;
    safeFindById: (id: MobilettoOrmIdArg, opts?: MobilettoOrmFindOpts) => Promise<T | null>;
    find: (predicate: MobilettoOrmPredicate, opts?: MobilettoOrmFindOpts) => Promise<T[]>;
    count: (predicate: MobilettoOrmPredicate) => Promise<number>;
    findBy: (
        field: string,
        /* eslint-disable @typescript-eslint/no-explicit-any */
        value: any,
        /* eslint-enable @typescript-eslint/no-explicit-any */
        opts?: MobilettoOrmFindOpts
    ) => Promise<T | T[] | null>;
    safeFindBy: (
        field: string,
        /* eslint-disable @typescript-eslint/no-explicit-any */
        value: any,
        /* eslint-enable @typescript-eslint/no-explicit-any */
        opts?: MobilettoOrmFindOpts
    ) => Promise<T | T[] | null>;
    safeFindFirstBy: (
        field: string,
        /* eslint-disable @typescript-eslint/no-explicit-any */
        value: any
        /* eslint-enable @typescript-eslint/no-explicit-any */
    ) => Promise<T | null>;
    existsWith: (field: string, value: any) => Promise<boolean>;
    findVersionsById: (id: MobilettoOrmIdArg) => Promise<Record<string, MobilettoOrmMetadata[]>>;
    findAll: (opts?: MobilettoOrmFindOpts) => Promise<T[]>;
    findAllIncludingRemoved: () => Promise<T[]>;
    findSingleton: () => Promise<T>;
};

export type MobilettoOrmRepositoryFactory = {
    storages: MobilettoConnection[] | MobilettoOrmStorageResolver;
    repository: <T extends MobilettoOrmObject>(
        typeDef: MobilettoOrmTypeDefConfig | MobilettoOrmTypeDef
    ) => MobilettoOrmRepository<T>;
};
