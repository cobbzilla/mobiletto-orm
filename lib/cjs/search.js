"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.search = void 0;
const mobiletto_base_1 = require("mobiletto-base");
const mobiletto_orm_typedef_1 = require("mobiletto-orm-typedef");
const util_js_1 = require("./util.js");
const search = (repository, storage, searchPath, removed, noRedact, noCollect, predicate, opts, promises, foundByHash, foundById) => __awaiter(void 0, void 0, void 0, function* () {
    const typeDef = repository.typeDef;
    return new Promise((resolve) => {
        storage
            .safeList(searchPath, { recursive: typeDef.indexLevels > 0 })
            .then((listing) => {
            if (!listing || listing.length === 0) {
                resolve();
            }
            const dirList = listing.filter((m) => m.type === mobiletto_base_1.M_DIR);
            const objList = dirList.filter((m) => m.name.endsWith(mobiletto_orm_typedef_1.OBJ_DIR_SUFFIX));
            if (objList.length === 0) {
                if (dirList.length > 0) {
                    const nestedPromises = [];
                    for (const dir of dirList) {
                        nestedPromises.push((0, exports.search)(repository, storage, dir.name, removed, noRedact, noCollect, predicate, opts, promises, foundByHash, foundById));
                    }
                    Promise.all(nestedPromises)
                        .then(() => {
                        resolve();
                    })
                        .catch((e4) => {
                        if (mobiletto_base_1.logger.isWarnEnabled()) {
                            mobiletto_base_1.logger.warn(`find: ${e4}`);
                        }
                        resolve();
                    });
                }
                else {
                    resolve();
                }
            }
            else {
                const findByIdPromises = [];
                for (const dir of objList) {
                    // find the latest version of each distinct thing
                    const idHash = dir.name;
                    if (typeof foundByHash[idHash] === "undefined") {
                        foundByHash[idHash] = null;
                        findByIdPromises.push(new Promise((resolve2) => {
                            repository
                                .findById(idHash, { removed, noRedact, idPath: true })
                                .then((thing) => {
                                // does the thing match the predicate? if so, include in results
                                // removed things are only included if opts.removed was set
                                if (thing) {
                                    const obj = thing;
                                    if (predicate(obj) && (0, util_js_1.includeRemovedThing)(removed, obj)) {
                                        (0, util_js_1.redactAndApply)(typeDef, obj, opts)
                                            .then((maybeRedacted) => {
                                            if (!noCollect) {
                                                foundByHash[idHash] = foundById[typeDef.id(maybeRedacted)] = maybeRedacted;
                                            }
                                            resolve2();
                                        })
                                            .catch((e4) => {
                                            if (mobiletto_base_1.logger.isWarnEnabled()) {
                                                mobiletto_base_1.logger.warn(`find: findById(${idHash}): ${e4}`);
                                            }
                                            resolve2();
                                        });
                                    }
                                }
                                else {
                                    resolve2();
                                }
                            })
                                .catch((e3) => {
                                if (mobiletto_base_1.logger.isWarnEnabled()) {
                                    mobiletto_base_1.logger.warn(`find: findById(${idHash}): ${e3}`);
                                }
                                resolve2();
                            });
                        }));
                    }
                }
                Promise.all(findByIdPromises)
                    .then(() => {
                    resolve();
                })
                    .catch((e4) => {
                    if (mobiletto_base_1.logger.isWarnEnabled()) {
                        mobiletto_base_1.logger.warn(`find: ${e4}`);
                    }
                    resolve();
                });
            }
        })
            .catch((e2) => {
            if (mobiletto_base_1.logger.isWarnEnabled()) {
                mobiletto_base_1.logger.warn(`find: safeList(${searchPath}): ${e2}`);
            }
            resolve();
        });
    });
});
exports.search = search;
