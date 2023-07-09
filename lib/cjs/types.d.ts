/// <reference types="node" />
import { MobilettoConnection, MobilettoMetadata } from "mobiletto-base";
import { MobilettoOrmIdArg, MobilettoOrmPersistable, MobilettoOrmTypeDef, MobilettoOrmTypeDefConfig } from "mobiletto-orm-typedef";
export type MobilettoOrmStorageResolver = () => Promise<MobilettoConnection[]>;
export type MobilettoOrmPredicate = (thing: MobilettoOrmPersistable) => boolean;
export type MobilettoOrmCurrentArg = null | undefined | MobilettoOrmPersistable | string;
export type MobilettoOrmFindOpts = {
    first?: boolean;
    removed?: boolean;
    exists?: boolean;
    noRedact?: boolean;
    predicate?: MobilettoOrmPredicate;
};
export type MobilettoOrmPersistableInstance = {
    storage: MobilettoConnection;
    object: MobilettoOrmPersistable;
    name: string;
    data?: Buffer;
};
export type MobilettoOrmMetadata = MobilettoMetadata & {
    data?: Buffer;
    object?: MobilettoOrmPersistable;
};
export type MobilettoOrmRepository = {
    typeDef: MobilettoOrmTypeDef;
    id: (thing: MobilettoOrmPersistable) => string | null;
    idField: (thing: MobilettoOrmPersistable) => string | null;
    validate: (thing: MobilettoOrmPersistable, current?: MobilettoOrmPersistable) => Promise<MobilettoOrmPersistable>;
    create: (thing: MobilettoOrmPersistable) => Promise<MobilettoOrmPersistable>;
    update: (editedThing: MobilettoOrmPersistable, current: MobilettoOrmCurrentArg) => Promise<MobilettoOrmPersistable>;
    remove: (id: MobilettoOrmIdArg, current?: MobilettoOrmCurrentArg) => Promise<MobilettoOrmPersistable>;
    purge: (idVal: MobilettoOrmIdArg) => Promise<unknown>;
    exists: (id: MobilettoOrmIdArg) => Promise<boolean>;
    resolveId: (idVal: MobilettoOrmIdArg) => string | MobilettoOrmIdArg;
    findById: (idVal: MobilettoOrmIdArg, opts?: MobilettoOrmFindOpts) => Promise<MobilettoOrmPersistable | boolean>;
    safeFindById: (id: MobilettoOrmIdArg, opts?: MobilettoOrmFindOpts) => Promise<MobilettoOrmPersistable | boolean | null>;
    find: (predicate: MobilettoOrmPredicate, opts?: MobilettoOrmFindOpts) => Promise<MobilettoOrmPersistable[]>;
    findBy: (field: string, value: any, opts?: MobilettoOrmFindOpts) => Promise<MobilettoOrmPersistable | MobilettoOrmPersistable[] | boolean | null>;
    safeFindBy: (field: string, value: any, opts?: MobilettoOrmFindOpts) => Promise<MobilettoOrmPersistable | MobilettoOrmPersistable[] | boolean | null>;
    findVersionsById: (id: MobilettoOrmIdArg) => Promise<Record<string, MobilettoOrmMetadata[]>>;
    findAll: (opts?: MobilettoOrmFindOpts) => Promise<MobilettoOrmPersistable[]>;
    findAllIncludingRemoved: () => Promise<MobilettoOrmPersistable[]>;
};
export type MobilettoOrmRepositoryFactory = {
    storages: MobilettoConnection[];
    repository: (typeDef: MobilettoOrmTypeDefConfig | MobilettoOrmTypeDef) => MobilettoOrmRepository;
};
