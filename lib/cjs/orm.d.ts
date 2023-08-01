import { MobilettoConnection } from "mobiletto-base";
import { MobilettoOrmRepositoryFactory, MobilettoOrmStorageResolver } from "./types.js";
export type MobilettoOrmRepositoryOptions = {
    prettyJson: boolean;
};
export declare const repositoryFactory: (storages: MobilettoConnection[] | MobilettoOrmStorageResolver, opts?: MobilettoOrmRepositoryOptions) => MobilettoOrmRepositoryFactory;
