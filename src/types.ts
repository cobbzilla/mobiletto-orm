import { MobilettoConnection, MobilettoMetadata } from "mobiletto-base";
import {
    MobilettoOrmFieldValue,
    MobilettoOrmFindOpts,
    MobilettoOrmIdArg,
    MobilettoOrmObject,
    MobilettoOrmPredicate,
    MobilettoOrmPurgeOpts,
    MobilettoOrmPurgeResults,
    MobilettoOrmTypeDef,
    MobilettoOrmTypeDefConfig,
} from "mobiletto-orm-typedef";

export type MobilettoOrmStorageResolver = () => Promise<MobilettoConnection[]>;

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
    factory: MobilettoOrmRepositoryFactory;
    id: (thing: T) => string | null;
    idField: (thing: T) => string | null;
    validate: (thing: T, current?: T) => Promise<T>;
    create: (thing: T) => Promise<T>;
    update: (editedThing: T) => Promise<T>;
    remove: (thing: MobilettoOrmIdArg) => Promise<MobilettoOrmObject>;
    purge: (idVal: MobilettoOrmIdArg, opts?: MobilettoOrmPurgeOpts) => Promise<MobilettoOrmPurgeResults>;
    exists: (id: MobilettoOrmIdArg) => Promise<boolean>;
    resolveId: (idVal: MobilettoOrmIdArg, ctx?: string) => string;
    findById: (idVal: MobilettoOrmIdArg, opts?: MobilettoOrmFindOpts) => Promise<T>;
    safeFindById: (id: MobilettoOrmIdArg, opts?: MobilettoOrmFindOpts) => Promise<T | null>;
    find: (opts: MobilettoOrmFindOpts) => Promise<T[]>;
    count: (predicate: MobilettoOrmPredicate) => Promise<number>;
    findBy: (field: string, value: MobilettoOrmFieldValue, opts?: MobilettoOrmFindOpts) => Promise<T | T[] | null>;
    safeFindBy: (field: string, value: MobilettoOrmFieldValue, opts?: MobilettoOrmFindOpts) => Promise<T | T[] | null>;
    safeFindFirstBy: (field: string, value: MobilettoOrmFieldValue, opts?: MobilettoOrmFindOpts) => Promise<T | null>;
    existsWith: (field: string, value: MobilettoOrmFieldValue) => Promise<boolean>;
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
