import { MobilettoConnection } from "mobiletto-base";
import { MobilettoOrmRepositoryFactory, MobilettoOrmStorageResolver } from "./types.js";
export type MobilettoOrmRepositoryOptions = {
    prettyJson?: boolean;
    registryName?: string;
};
export declare const repositoryFactory: (storages: MobilettoConnection[] | MobilettoOrmStorageResolver, opts?: MobilettoOrmRepositoryOptions) => MobilettoOrmRepositoryFactory;
