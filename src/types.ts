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

export type MobilettoOrmRepository = {
    typeDef: MobilettoOrmTypeDef;
    id: (thing: MobilettoOrmObject) => string | null;
    idField: (thing: MobilettoOrmObject) => string | null;
    validate: (thing: MobilettoOrmObject, current?: MobilettoOrmObject) => Promise<MobilettoOrmObject>;
    create: (thing: MobilettoOrmObject) => Promise<MobilettoOrmObject>;
    update: (editedThing: MobilettoOrmObject, current: MobilettoOrmCurrentArg) => Promise<MobilettoOrmObject>;
    remove: (id: MobilettoOrmIdArg, current?: MobilettoOrmCurrentArg) => Promise<MobilettoOrmObject>;
    purge: (idVal: MobilettoOrmIdArg) => Promise<unknown>;
    exists: (id: MobilettoOrmIdArg) => Promise<boolean>;
    resolveId: (idVal: MobilettoOrmIdArg, ctx?: string) => string | MobilettoOrmIdArg;
    findById: (idVal: MobilettoOrmIdArg, opts?: MobilettoOrmFindOpts) => Promise<MobilettoOrmObject | boolean>;
    safeFindById: (id: MobilettoOrmIdArg, opts?: MobilettoOrmFindOpts) => Promise<MobilettoOrmObject | boolean | null>;
    find: (predicate: MobilettoOrmPredicate, opts?: MobilettoOrmFindOpts) => Promise<MobilettoOrmObject[]>;
    findBy: (
        field: string,
        /* eslint-disable @typescript-eslint/no-explicit-any */
        value: any,
        /* eslint-enable @typescript-eslint/no-explicit-any */
        opts?: MobilettoOrmFindOpts
    ) => Promise<MobilettoOrmObject | MobilettoOrmObject[] | boolean | null>;
    safeFindBy: (
        field: string,
        /* eslint-disable @typescript-eslint/no-explicit-any */
        value: any,
        /* eslint-enable @typescript-eslint/no-explicit-any */
        opts?: MobilettoOrmFindOpts
    ) => Promise<MobilettoOrmObject | MobilettoOrmObject[] | boolean | null>;
    findVersionsById: (id: MobilettoOrmIdArg) => Promise<Record<string, MobilettoOrmMetadata[]>>;
    findAll: (opts?: MobilettoOrmFindOpts) => Promise<MobilettoOrmObject[]>;
    findAllIncludingRemoved: () => Promise<MobilettoOrmObject[]>;
};

export type MobilettoOrmRepositoryFactory = {
    storages: MobilettoConnection[];
    repository: (typeDef: MobilettoOrmTypeDefConfig | MobilettoOrmTypeDef) => MobilettoOrmRepository;
};
