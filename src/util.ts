import { logger, MobilettoConnection } from "mobiletto-base";
import {
    MobilettoOrmError,
    MobilettoOrmIdArg,
    MobilettoOrmObject,
    MobilettoOrmSyncError,
    MobilettoOrmTypeDef,
} from "mobiletto-orm-typedef";
import {
    MobilettoOrmCurrentArg,
    MobilettoOrmPredicate,
    MobilettoOrmRepository,
    MobilettoOrmStorageResolver,
} from "./types.js";

export const resolveStorages = async (
    stores: MobilettoConnection[] | MobilettoOrmStorageResolver
): Promise<MobilettoConnection[]> => {
    if (Array.isArray(stores)) return stores;
    if (typeof stores === "function") return await stores();
    throw new MobilettoOrmError(`resolveStorages: stores was neither an array nor a function. stores=${stores}`);
};

export const parseCurrent = (current: MobilettoOrmCurrentArg) => {
    if (typeof current === "undefined" || current == null) {
        throw new MobilettoOrmError("no current version provided");
    }
    let version = current;
    if (typeof current === "object" && current._meta && typeof current._meta.version === "string") {
        version = current._meta.version;
    }
    if (typeof version !== "string") {
        throw new MobilettoOrmError(`expected current version as string (was ${typeof version})`);
    }
    return version;
};

export const findVersion = async <T extends MobilettoOrmObject>(
    repository: MobilettoOrmRepository<T>,
    id: MobilettoOrmIdArg,
    current?: MobilettoOrmCurrentArg
): Promise<T> => {
    const found = (await repository.findById(id)) as T;
    const foundVersion = found._meta?.version;
    const expectedVersion = current == null ? foundVersion : parseCurrent(current);

    // is the current version what we expected? if not, error
    if (foundVersion !== expectedVersion) {
        throw new MobilettoOrmSyncError(id, `expected version ${expectedVersion} but found ${foundVersion}`);
    }
    return found;
};

export const includeRemovedThing = (includeRemoved: boolean, thing: MobilettoOrmObject): boolean =>
    includeRemoved ||
    typeof thing._meta === "undefined" ||
    typeof thing._meta.removed === "undefined" ||
    (typeof thing._meta.removed === "boolean" && thing._meta.removed !== true);

export const verifyWrite = async <T extends MobilettoOrmObject>(
    repository: MobilettoOrmRepository<T>,
    storages: MobilettoConnection[] | MobilettoOrmStorageResolver,
    typeDef: MobilettoOrmTypeDef,
    id: string,
    obj: MobilettoOrmObject,
    removedObj?: MobilettoOrmObject
) => {
    const writePromises: Promise<number | string | string[] | Error>[] = [];
    const writeSuccesses: boolean[] = [];
    const actualStorages = await resolveStorages(storages);
    const expectedSuccessCount = typeDef.minWrites < 0 ? actualStorages.length : typeDef.minWrites;
    const objPath = typeDef.specificPath(obj);
    const objJson = JSON.stringify(obj);
    for (const storage of actualStorages) {
        // write object
        writePromises.push(
            new Promise<number | Error>((resolve) => {
                storage
                    .writeFile(objPath, objJson)
                    .then((bytesWritten: number) => {
                        if (bytesWritten === objJson.length) {
                            writeSuccesses.push(true);
                            resolve(bytesWritten);
                        } else {
                            const message = `verifyWrite(${id}): expected to write ${objJson.length} bytes but wrote ${bytesWritten}`;
                            const fail = new MobilettoOrmSyncError(id, message);
                            if (logger.isWarnEnabled()) logger.warn(message);
                            resolve(fail);
                        }
                    })
                    .catch((e: Error) => {
                        if (logger.isWarnEnabled()) logger.warn(`verifyWrite(${id}): error: ${JSON.stringify(e)}`);
                        resolve(e);
                    });
            })
        );
        // if remove is null, write index values, if they don't already exist
        // if remove is non-null, remove index values
        for (const fieldName of typeDef.indexes) {
            const idxPath = typeDef.indexSpecificPath(fieldName, (removedObj ? removedObj : obj) as MobilettoOrmObject);
            let indexPromise;
            if (removedObj) {
                indexPromise = new Promise<string | string[] | Error>((resolve) => {
                    storage
                        .remove(idxPath)
                        .then((result: string | string[]) => resolve(result))
                        .catch((e: Error) => {
                            if (logger.isWarnEnabled()) {
                                logger.warn(
                                    `verifyWrite(${id}, index=${idxPath}, delete): error: ${JSON.stringify(e)}`
                                );
                            }
                            resolve(e);
                        });
                });
            } else {
                indexPromise = new Promise<string | Error>((resolve) => {
                    storage.safeMetadata(idxPath).then(() => {
                        storage
                            .writeFile(idxPath, "")
                            .then(() => {
                                resolve(idxPath);
                            })
                            .catch((e: Error) => {
                                if (logger.isWarnEnabled()) {
                                    logger.warn(
                                        `verifyWrite(${id}, index=${idxPath}, create): error: ${JSON.stringify(e)}`
                                    );
                                }
                                resolve(e);
                            });
                    });
                });
            }
            writePromises.push(indexPromise);
        }
    }
    const writeResults = await Promise.all(writePromises);
    if (logger.isDebugEnabled()) logger.debug(`verifyWrite(${id}): writeResults = ${JSON.stringify(writeResults)}`);

    let failure = null;
    if (writeSuccesses.length < expectedSuccessCount) {
        failure = new MobilettoOrmSyncError(
            id,
            `verifyWrite(${id}): insufficient writes: writeSuccesses.length (${writeSuccesses.length}) < expectedSuccessCount (${expectedSuccessCount})`
        );
    } else {
        const failedWrites = [];
        const confirmedWrites = [];
        for (const storage of actualStorages) {
            failedWrites.push(storage.name);
        }
        try {
            const allVersions = await repository.findVersionsById(id);
            for (const storageName of Object.keys(allVersions)) {
                if (storageName in allVersions) {
                    const versions = allVersions[storageName];
                    if (
                        versions.length > 0 &&
                        versions[versions.length - 1].object &&
                        JSON.stringify(versions[versions.length - 1].object) === objJson
                    ) {
                        const idx = failedWrites.indexOf(storageName);
                        if (idx !== -1) {
                            failedWrites.splice(idx, 1);
                        }
                        confirmedWrites.push(storageName);
                    } else {
                        if (logger.isWarnEnabled()) {
                            logger.warn(`verifyWrite(${id}): failedWrite to ${storageName}`);
                        }
                    }
                }
            }
            if (confirmedWrites.length < expectedSuccessCount) {
                failure = new MobilettoOrmSyncError(
                    id,
                    `verifyWrite(${id}): insufficient writes: confirmedWrites.length (${confirmedWrites.length}) < expectedSuccessCount (${expectedSuccessCount})`
                );
            }
        } catch (e) {
            if (logger.isWarnEnabled()) {
                logger.warn(`verifyWrite(${id}) error confirming writes via read: ${JSON.stringify(e)}`);
            }
            failure = new MobilettoOrmSyncError(id, JSON.stringify(e));
        }
    }
    if (failure != null) {
        if (logger.isWarnEnabled()) {
            logger.warn(`verifyWrite(${id}) error confirming writes via read: ${JSON.stringify(failure)}`);
        }
        for (const storage of actualStorages) {
            await storage.remove(objPath);
        }
        throw failure;
    }
    return obj;
};

export type MobilettoFoundMarker = { found: boolean };

export const promiseFindById = <T extends MobilettoOrmObject>(
    repository: MobilettoOrmRepository<T>,
    storage: MobilettoConnection,
    field: string,
    /* eslint-disable @typescript-eslint/no-explicit-any */
    value: any,
    /* eslint-enable @typescript-eslint/no-explicit-any */
    id: string,
    exists: boolean,
    first: boolean,
    removed: boolean,
    noRedact: boolean,
    predicate: MobilettoOrmPredicate | null,
    found: Record<string, MobilettoOrmObject | null>,
    addedAnything: MobilettoFoundMarker
): Promise<string> => {
    const typeDef = repository.typeDef;
    const logPrefix = `promiseFindById(${storage.name}, ${field}, ${value})[${id}]:`;
    return new Promise<string>((resolve) => {
        repository
            .findById(id, { removed, noRedact })
            .then((thing) => {
                const obj = thing as MobilettoOrmObject;
                if (includeRemovedThing(removed, obj) && (predicate == null || predicate(obj))) {
                    found[id] = noRedact ? obj : typeDef.redact(obj);
                    if (exists || first) {
                        addedAnything.found = true;
                    }
                    resolve(`${logPrefix} resolving FOUND: ${JSON.stringify(obj)}`);
                } else {
                    resolve(`${logPrefix} resolving (not including removed thing): ${JSON.stringify(obj)}`);
                }
            })
            .catch((e2) => {
                if (logger.isWarnEnabled()) {
                    logger.warn(`${logPrefix} error: ${e2}`);
                }
                resolve(`${logPrefix} resolving as error: ${e2}`);
            });
    });
};
