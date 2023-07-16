import { MobilettoConnection } from "mobiletto-base";
import { MobilettoOrmRepositoryFactory, MobilettoOrmStorageResolver } from "./types.js";
export declare const repositoryFactory: (storages: MobilettoConnection[] | MobilettoOrmStorageResolver) => MobilettoOrmRepositoryFactory;
