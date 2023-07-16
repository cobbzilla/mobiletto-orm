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
    exists?: boolean;
    noRedact?: boolean;
    predicate?: MobilettoOrmPredicate;
};

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
    findById: (idVal: MobilettoOrmIdArg, opts?: MobilettoOrmFindOpts) => Promise<T | boolean>;
    safeFindById: (id: MobilettoOrmIdArg, opts?: MobilettoOrmFindOpts) => Promise<T | boolean | null>;
    find: (predicate: MobilettoOrmPredicate, opts?: MobilettoOrmFindOpts) => Promise<T[]>;
    findBy: (
        field: string,
        /* eslint-disable @typescript-eslint/no-explicit-any */
        value: any,
        /* eslint-enable @typescript-eslint/no-explicit-any */
        opts?: MobilettoOrmFindOpts
    ) => Promise<T | T[] | boolean | null>;
    safeFindBy: (
        field: string,
        /* eslint-disable @typescript-eslint/no-explicit-any */
        value: any,
        /* eslint-enable @typescript-eslint/no-explicit-any */
        opts?: MobilettoOrmFindOpts
    ) => Promise<T | T[] | boolean | null>;
    findVersionsById: (id: MobilettoOrmIdArg) => Promise<Record<string, MobilettoOrmMetadata[]>>;
    findAll: (opts?: MobilettoOrmFindOpts) => Promise<T[]>;
    findAllIncludingRemoved: () => Promise<T[]>;
};

export type MobilettoOrmRepositoryFactory = {
    storages: MobilettoConnection[] | MobilettoOrmStorageResolver;
    repository: <T extends MobilettoOrmObject>(
        typeDef: MobilettoOrmTypeDefConfig | MobilettoOrmTypeDef
    ) => MobilettoOrmRepository<T>;
};
