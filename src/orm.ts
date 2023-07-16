import path from "path";
import { M_DIR, logger, MobilettoConnection, MobilettoMetadata, MobilettoConnectionFunction } from "mobiletto-base";
import {
    MobilettoOrmTypeDef,
    MobilettoOrmValidationError,
    MobilettoOrmSyncError,
    MobilettoOrmNotFoundError,
    MobilettoOrmTypeDefConfig,
    MobilettoOrmObject,
    MobilettoOrmIdArg,
    MobilettoOrmError,
    MobilettoOrmNormalizeFunc,
} from "mobiletto-orm-typedef";
import {
    FIND_FIRST,
    MobilettoOrmCurrentArg,
    MobilettoOrmFindOpts,
    MobilettoOrmMetadata,
    MobilettoOrmObjectInstance,
    MobilettoOrmPredicate,
    MobilettoOrmRepository,
    MobilettoOrmRepositoryFactory,
    MobilettoOrmStorageResolver,
} from "./types.js";
import {
    findVersion,
    includeRemovedThing,
    MobilettoFoundMarker,
    promiseFindById,
    resolveStorages,
    verifyWrite,
} from "./util.js";

const repo = <T extends MobilettoOrmObject>(
    storages: MobilettoConnection[] | MobilettoOrmStorageResolver,
    typeDefOrConfig: MobilettoOrmTypeDefConfig | MobilettoOrmTypeDef
): MobilettoOrmRepository<T> => {
    const typeDef: MobilettoOrmTypeDef =
        typeDefOrConfig instanceof MobilettoOrmTypeDef ? typeDefOrConfig : new MobilettoOrmTypeDef(typeDefOrConfig);
    const repository: MobilettoOrmRepository<T> = {
        typeDef,
        async validate(thing: T, current?: T): Promise<T> {
            return typeDef.validate(thing, current) as Promise<T>;
        },
        id(thing: T): string | null {
            return typeDef.id(thing);
        },
        idField(thing: T) {
            return typeDef.idField(thing);
        },
        async create(thing: T): Promise<T> {
            // validate fields
            const obj = await typeDef.validate(thing);

            // does thing with PK exist? if so, error
            const id = typeDef.id(obj);
            if (!id) {
                throw new MobilettoOrmNotFoundError(typeof obj !== "undefined" ? JSON.stringify(obj) : "undefined");
            }
            let found = null;
            try {
                found = await repository.findById(id);
            } catch (e) {
                if (e instanceof MobilettoOrmNotFoundError) {
                    // expected
                } else {
                    throw e;
                }
            }
            if (found != null) {
                throw new MobilettoOrmValidationError({ id: ["exists"] });
            }

            // save thing, then read current version: is it what we just wrote? if not then error
            obj._meta = typeDef.newMeta(id);
            return typeDef.redact(await verifyWrite(repository, storages, typeDef, id, obj)) as T;
        },
        async update(editedThing: T, current: MobilettoOrmCurrentArg): Promise<T> {
            const id = typeDef.id(editedThing);
            if (!id) {
                throw new MobilettoOrmSyncError("undefined", "update: error determining id");
            }
            if (typeof current === "undefined" || current == null) {
                throw new MobilettoOrmSyncError(id, "update: current version is required");
            }

            // does thing with PK exist? if not, error
            const found = await findVersion(repository, id, current);
            if (!found._meta) {
                throw new MobilettoOrmError("update: findVersion returned object without _meta");
            }

            // validate fields
            const obj = await typeDef.validate(editedThing, found);
            if (!obj._meta) {
                throw new MobilettoOrmError("update: validate returned object without _meta");
            }

            if (
                typeof obj._meta.version === "undefined" ||
                !obj._meta.version ||
                found._meta.version === obj._meta.version
            ) {
                obj._meta.version = typeDef.newVersion();
            }

            // remove old indexes
            const indexCleanups = [];
            for (const fieldName of Object.keys(typeDef.fields)) {
                const field = typeDef.fields[fieldName];
                if (!!field.index && typeof found[fieldName] !== "undefined") {
                    const idxPath = typeDef.indexSpecificPath(fieldName, found);
                    for (const storage of await resolveStorages(storages)) {
                        indexCleanups.push(storage.remove(idxPath));
                    }
                }
            }
            await Promise.all(indexCleanups);

            // update thing, then read current version: is it what we just wrote? if not, error
            const now = Date.now();
            if (typeof obj._meta.ctime !== "number" || obj._meta.ctime < 0) {
                obj._meta.ctime = now;
            }
            if (typeof obj.mtime !== "number" || obj.mtime < obj.ctime) {
                obj._meta.mtime = now;
            }
            const toWrite = Object.assign({}, found, obj);
            return typeDef.redact(await verifyWrite(repository, storages, typeDef, id, toWrite)) as T;
        },
        async remove(id: MobilettoOrmIdArg, current?: MobilettoOrmCurrentArg): Promise<T> {
            // is there a thing that matches current? if not, error
            const found: T = (await findVersion<T>(repository, id, current)) as T;

            // write tombstone record, then read current version: is it what we just wrote? if not, error
            const tombstone = typeDef.tombstone(found);
            return typeDef.redact(
                await verifyWrite(repository, storages, typeDef, typeDef.id(found), tombstone, found)
            ) as T;
        },
        async purge(idVal: MobilettoOrmIdArg) {
            const id = this.resolveId(idVal, "purge");
            const found = await this.findById(id, { removed: true });
            if (!typeDef.isTombstone(found as T)) {
                throw new MobilettoOrmSyncError(idVal);
            }
            const objPath = typeDef.generalPath(id);
            const deletePromises = [];
            for (const storage of await resolveStorages(storages)) {
                deletePromises.push(
                    new Promise((resolve, reject) => {
                        storage
                            .remove(objPath, { recursive: true })
                            .then((result: string | string[]) => resolve(result))
                            .catch((e: Error) => {
                                reject(e);
                            });
                    })
                );
            }
            return await Promise.all(deletePromises);
        },
        async safeFindById(id: MobilettoOrmIdArg, opts?: MobilettoOrmFindOpts): Promise<T | null> {
            try {
                return await this.findById(id, opts);
            } catch (e) {
                return null;
            }
        },
        async exists(id: MobilettoOrmIdArg): Promise<boolean> {
            return (await this.safeFindById(id)) != null;
        },
        resolveId(id: MobilettoOrmIdArg, ctx?: string) {
            const resolved = typeof id === "object" ? this.id(id) : typeof id === "string" && id.length > 0 ? id : null;
            if (!resolved) {
                throw new MobilettoOrmError(`resolveId${ctx ? `[${ctx}]` : ""}: unresolvable id: ${id}`);
            }
            return resolved;
        },
        async findById(idVal: MobilettoOrmIdArg, opts?: MobilettoOrmFindOpts): Promise<T> {
            const id = this.resolveId(idVal, "findById");

            const objPath = typeDef.generalPath(id);
            const listPromises = [];
            const found: Record<string, MobilettoOrmObjectInstance> = {};
            const absent: MobilettoConnection[] = [];
            const removed = !!(opts && opts.removed && opts.removed === true);
            const noRedact = !!(opts && opts.noRedact && opts.noRedact === true) || !typeDef.hasRedactions();

            // read current version from each storage
            for (const storage of await resolveStorages(storages)) {
                listPromises.push(
                    new Promise<void>((resolve) => {
                        // try {
                        storage.safeList(objPath).then((files: MobilettoMetadata[]) => {
                            if (files && files.length > 0) {
                                files
                                    .filter((f: MobilettoMetadata) => f.name && typeDef.isSpecificPath(f.name))
                                    .sort((f1: MobilettoMetadata, f2: MobilettoMetadata) =>
                                        f1.name.localeCompare(f2.name)
                                    );
                                const mostRecentFile = files[files.length - 1].name;
                                storage
                                    .safeReadFile(mostRecentFile)
                                    .then((data: Buffer | null) => {
                                        if (!data) {
                                            resolve();
                                            return;
                                        }
                                        const object = noRedact
                                            ? JSON.parse(data.toString("utf8"))
                                            : typeDef.redact(JSON.parse(data.toString("utf8")));
                                        if (!includeRemovedThing(removed, object)) {
                                            resolve();
                                            return;
                                        }
                                        found[storage.name] = {
                                            storage,
                                            object,
                                            name: path.basename(mostRecentFile),
                                        };
                                        if (noRedact) {
                                            found[storage.name].data = data;
                                        }
                                        // clean up excess versions
                                        if (files.length > typeDef.maxVersions) {
                                            const removePromises: Promise<string | string[]>[] = [];
                                            files.map((f: MobilettoMetadata) => {
                                                removePromises.push(storage.remove(f.name));
                                            });
                                            Promise.all(removePromises).then((result) => {
                                                if (result) {
                                                    const removed = result.flat(1);
                                                    if (logger.isInfoEnabled()) {
                                                        logger.info(
                                                            `findById(${id}): removed ${removed.length} excess versions`
                                                        );
                                                    }
                                                }
                                            });
                                        }
                                        resolve();
                                    })
                                    .catch((e: Error) => {
                                        if (logger.isErrorEnabled()) {
                                            logger.error(`findById(${id}) error reading ${mostRecentFile}: ${e}`);
                                        }
                                        resolve();
                                    });
                            } else {
                                absent.push(storage);
                                resolve();
                            }
                        });
                    })
                );
            }
            await Promise.all(listPromises);
            if (Object.values(found).length === 0) {
                throw new MobilettoOrmNotFoundError(id);
            }
            const sortedFound = Object.values(found).sort((f1, f2) =>
                f1.name && f2.name ? f1.name.localeCompare(f2.name) : 0
            );

            // sync: update older/missing versions to the newest version
            const newest = sortedFound[sortedFound.length - 1];
            const newestObj = newest.object;
            const newestJson = JSON.stringify(newestObj);
            const newestPath = typeDef.specificPath(newestObj);
            const syncPromises = [];
            for (let i = 0; i < sortedFound.length - 1; i++) {
                const f = sortedFound[i];
                if (newestJson !== JSON.stringify(f.object)) {
                    syncPromises.push(
                        new Promise((resolve) => {
                            try {
                                resolve(f.storage.writeFile(newestPath, newestJson));
                            } catch (e) {
                                if (logger.isWarnEnabled()) {
                                    logger.warn(
                                        `findById: storage[${f.storage.name}].writeFile(${newestPath}) failed: ${e}`
                                    );
                                }
                                resolve(e);
                            }
                        })
                    );
                }
            }
            for (const missing of absent) {
                syncPromises.push(
                    new Promise<number | void>((resolve) => {
                        try {
                            resolve(missing.writeFile(newestPath, newestJson));
                        } catch (e) {
                            if (logger.isWarnEnabled()) {
                                logger.warn(`findById: storage[${missing.name}].writeFile(${newestPath}) failed: ${e}`);
                            }
                            resolve();
                        }
                    })
                );
            }
            try {
                await Promise.all(syncPromises);
            } catch (e) {
                if (logger.isWarnEnabled()) {
                    logger.warn(`findById: error resolving syncPromises: ${e}`);
                }
            }
            return (noRedact ? newestObj : typeDef.redact(newestObj)) as T;
        },
        async find(predicate: MobilettoOrmPredicate, opts?: MobilettoOrmFindOpts): Promise<T[]> {
            const typePath = typeDef.typePath();
            const removed = !!(opts && opts.removed && opts.removed === true);
            const noRedact = !!(opts && opts.noRedact && opts.noRedact === true) || !typeDef.hasRedactions();

            const promises: Promise<void>[] = [];
            const found: Record<string, T | null> = {};

            // read all things concurrently
            for (const storage of await resolveStorages(storages)) {
                promises.push(
                    new Promise<void>((resolve) => {
                        storage
                            .safeList(typePath)
                            .then((listing: MobilettoMetadata[] | null) => {
                                if (!listing || listing.length === 0) {
                                    resolve();
                                }
                                const typeList: MobilettoMetadata[] = (listing as MobilettoMetadata[]).filter(
                                    (m) => m.type === M_DIR
                                );
                                if (typeList.length === 0) {
                                    resolve();
                                }
                                const findByIdPromises: Promise<void>[] = [];
                                for (const dir of typeList) {
                                    // find the latest version of each distinct thing
                                    const id: string = path.basename(dir.name);
                                    if (typeof found[id] === "undefined") {
                                        found[id] = null;
                                        findByIdPromises.push(
                                            new Promise<void>((resolve2) => {
                                                repository
                                                    .findById(id, { removed, noRedact })
                                                    .then((thing) => {
                                                        // does the thing match the predicate? if so, include in results
                                                        // removed things are only included if opts.removed was set
                                                        if (thing) {
                                                            const obj = thing as T;
                                                            if (predicate(obj) && includeRemovedThing(removed, obj)) {
                                                                found[id] = (noRedact ? obj : typeDef.redact(obj)) as T;
                                                            }
                                                        }
                                                        resolve2();
                                                    })
                                                    .catch((e3: Error) => {
                                                        if (logger.isWarnEnabled()) {
                                                            logger.warn(`find: findById(${id}): ${e3}`);
                                                        }
                                                        resolve2();
                                                    });
                                            })
                                        );
                                    }
                                }
                                Promise.all(findByIdPromises)
                                    .then(() => {
                                        resolve();
                                    })
                                    .catch((e4: Error) => {
                                        if (logger.isWarnEnabled()) {
                                            logger.warn(`find: ${e4}`);
                                        }
                                        resolve();
                                    });
                            })
                            .catch((e2: Error) => {
                                if (logger.isWarnEnabled()) {
                                    logger.warn(`find: safeList(${typePath}): ${e2}`);
                                }
                                resolve();
                            });
                    })
                );
            }
            await Promise.all(promises);
            const resolved = await Promise.all(promises);
            if (resolved.length !== promises.length) {
                if (logger.isWarnEnabled()) {
                    logger.warn(`find: ${resolved} of ${promises.length} promises resolved`);
                }
            }
            return Object.values(found).filter((f) => f != null) as T[];
        },
        async count(predicate: MobilettoOrmPredicate): Promise<number> {
            return (await this.find(predicate)).length;
        },
        async findBy(
            field: string,
            /* eslint-disable @typescript-eslint/no-explicit-any */
            value: any,
            /* eslint-enable @typescript-eslint/no-explicit-any */
            opts?: MobilettoOrmFindOpts
        ): Promise<T | T[] | null> {
            const compValue =
                typeDef.fields &&
                typeDef.fields[field] &&
                value &&
                typeof typeDef.fields[field].normalize === "function"
                    ? (typeDef.fields[field].normalize as MobilettoOrmNormalizeFunc)(value)
                    : value;
            if (typeDef.primary && field === typeDef.primary) {
                return [(await this.findById(compValue, opts)) as T];
            }
            const idxPath: string = typeDef.indexPath(field, compValue);
            const removed = !!(opts && opts.removed && opts.removed);
            const noRedact = !!(opts && opts.noRedact && opts.noRedact) || !typeDef.hasRedactions();
            const first = !!(opts && typeof opts.first === "boolean" && opts.first);
            const predicate: MobilettoOrmPredicate | null =
                opts && typeof opts.predicate === "function" ? opts.predicate : null;

            // read all things concurrently
            const storagePromises: Promise<string>[] = [];
            const found: Record<string, T | null> = {};
            const addedAnything: MobilettoFoundMarker = { found: false };
            for (const storage of await resolveStorages(storages)) {
                const logPrefix = `[1] storage(${storage.name}):`;
                if (first && addedAnything.found) {
                    break;
                }
                storagePromises.push(
                    new Promise<string>((resolve) => {
                        if (first && addedAnything.found) {
                            resolve(`[1] storage(${storage.name}): already found, resolving`);
                        } else {
                            storage
                                .safeList(idxPath)
                                .then((indexEntries: MobilettoMetadata[]) => {
                                    const findByIdPromises: Promise<string>[] = [];
                                    for (const entry of indexEntries) {
                                        if (first && addedAnything.found) {
                                            resolve(`${logPrefix} (after listing) already found, resolving`);
                                            break;
                                        }
                                        const id = typeDef.idFromPath(entry.name);
                                        if (typeof found[id] === "undefined") {
                                            found[id] = null;
                                            findByIdPromises.push(
                                                promiseFindById(
                                                    repository,
                                                    storage,
                                                    field,
                                                    value,
                                                    id,
                                                    first,
                                                    removed,
                                                    noRedact,
                                                    predicate,
                                                    found,
                                                    addedAnything
                                                )
                                            );
                                        }
                                    }
                                    Promise.all(findByIdPromises)
                                        .then(() => {
                                            resolve(
                                                `${logPrefix} resolved ${
                                                    findByIdPromises.length
                                                } findByIdPromises: ${JSON.stringify(findByIdPromises)}`
                                            );
                                        })
                                        .catch((findErr: Error) => {
                                            `${logPrefix} error resolving ${findByIdPromises.length} findByIdPromises: ${findErr}`;
                                        });
                                })
                                .catch((e: Error) => {
                                    if (logger.isWarnEnabled()) {
                                        logger.warn(`findBy(${field}, ${value}) error: ${e}`);
                                    }
                                    resolve(`${logPrefix} Resolving to error: ${e}`);
                                });
                        }
                    })
                );
            }
            const results = await Promise.all(storagePromises);
            logger.info(`findBy promise results = ${JSON.stringify(results)}`);
            const foundValues: T[] = Object.values(found).filter((v) => v != null) as T[];
            if (first) {
                return foundValues.length > 0 ? foundValues[0] : null;
            }
            return foundValues;
        },
        async safeFindBy(
            field: string,
            /* eslint-disable @typescript-eslint/no-explicit-any */
            value: any,
            /* eslint-enable @typescript-eslint/no-explicit-any */
            opts?: MobilettoOrmFindOpts
        ): Promise<T | T[] | null> {
            const first = (opts && typeof opts.first && opts.first === true) || false;
            try {
                return await this.findBy(field, value, opts);
            } catch (e) {
                if (logger.isWarnEnabled()) {
                    logger.warn(`safeFindBy(${field}) threw ${e}`);
                }
                return first ? null : [];
            }
        },
        async safeFindFirstBy(
            field: string,
            /* eslint-disable @typescript-eslint/no-explicit-any */
            value: any,
            /* eslint-enable @typescript-eslint/no-explicit-any */
            opts?: MobilettoOrmFindOpts
        ): Promise<T | null> {
            try {
                const found = await this.safeFindBy(field, value, FIND_FIRST);
                return found ? (found as T) : null;
            } catch (e) {
                if (logger.isWarnEnabled()) {
                    logger.warn(`safeFindBy(${field}) threw ${e}`);
                }
                return null;
            }
        },
        async existsWith(field: string, value: any): Promise<boolean> {
            const found = await this.safeFindBy(field, value);
            return (
                found != null &&
                ((Array.isArray(found) && found.length > 0) || (!Array.isArray(found) && typeof found === "object"))
            );
        },
        async findVersionsById(id: MobilettoOrmIdArg): Promise<Record<string, MobilettoOrmMetadata[]>> {
            const objPath = typeDef.generalPath(id);
            const storagePromises: Promise<void>[] = [];
            const found: Record<string, MobilettoMetadata[]> = {};

            // read current version from each storage
            for (const storage of await resolveStorages(storages)) {
                storagePromises.push(
                    new Promise<void>((resolve, reject) => {
                        storage
                            .safeList(objPath)
                            .then((files: MobilettoMetadata[]) => {
                                const dataPromises: Promise<MobilettoMetadata>[] = [];
                                if (!files || files.length === 0) {
                                    resolve();
                                } else {
                                    files
                                        .filter((f: MobilettoMetadata) => f.name && typeDef.isSpecificPath(f.name))
                                        .sort((f1: MobilettoMetadata, f2: MobilettoMetadata) =>
                                            f1.name.localeCompare(f2.name)
                                        )
                                        .map((f: MobilettoOrmMetadata) => {
                                            dataPromises.push(
                                                new Promise<MobilettoOrmMetadata>((resolve2, reject2) => {
                                                    storage
                                                        .safeReadFile(f.name)
                                                        .then((data: Buffer | null) => {
                                                            if (!data) {
                                                                reject2(
                                                                    new MobilettoOrmError(
                                                                        `findVersionsById(${id}): safeReadFile error, no data`
                                                                    )
                                                                );
                                                            }
                                                            if (!typeDef.hasRedactions()) {
                                                                f.data = data || undefined;
                                                            }
                                                            f.object = data
                                                                ? typeDef.redact(JSON.parse(data.toString("utf8")))
                                                                : undefined;
                                                            resolve2(f);
                                                        })
                                                        .catch((e2: Error) => {
                                                            if (logger.isWarnEnabled()) {
                                                                logger.warn(
                                                                    `findVersionsById(${id}): safeReadFile error ${e2}`
                                                                );
                                                            }
                                                            reject2(e2);
                                                        });
                                                })
                                            );
                                        });
                                    Promise.all(dataPromises)
                                        .then(() => {
                                            found[storage.name] = files;
                                            resolve();
                                        })
                                        .catch((e: Error) => {
                                            reject(e);
                                        });
                                }
                            })
                            .catch((e: Error) => {
                                if (logger.isErrorEnabled()) {
                                    logger.error(`findVersionsById(${id}): ${e}`);
                                }
                                reject(e);
                            });
                    })
                );
            }
            await Promise.all(storagePromises);
            return found;
        },
        async findAll(opts?: MobilettoOrmFindOpts): Promise<T[]> {
            return repository.find(() => true, opts);
        },
        async findAllIncludingRemoved(): Promise<T[]> {
            return repository.find(() => true, { removed: true });
        },
    };
    return repository;
};

export const repositoryFactory = (
    storages: MobilettoConnection[] | MobilettoOrmStorageResolver
): MobilettoOrmRepositoryFactory => {
    return {
        storages,
        repository: <T extends MobilettoOrmObject>(typeDef: MobilettoOrmTypeDefConfig | MobilettoOrmTypeDef) =>
            repo<T>(storages, typeDef),
    };
};
