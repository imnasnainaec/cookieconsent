import { globalObj, isFunction } from '../core/global';
import { createNode, setAttribute, elContains, getAttribute, removeAttribute } from './general';
import { SCRIPT_TAG_SELECTOR } from './constants';

/**
 * This function handles the loading/activation logic of the already
 * existing scripts based on the current accepted cookie categories
 *
 * @param {string[]} [mustEnableCategories]
 */
export const manageExistingScripts = (mustEnableCategories) => {

    const state = globalObj._state;
    const enabledServices = state._enabledServices;

    /**
     * Automatically Enable/Disable internal services
     */
    for(const categoryName of state._allCategoryNames){

        const lastChangedServices = state._lastChangedServices[categoryName]
            || state._enabledServices[categoryName]
            || [];

        for(const serviceName of lastChangedServices){
            const service = state._allDefinedServices[categoryName][serviceName];
            const {onAccept, onReject} = service;

            if(!service)
                continue;

            if(
                !service._enabled
                && elContains(state._enabledServices[categoryName], serviceName)
                && isFunction(onAccept)
            ){
                service._enabled = true;
                onAccept();
            }

            else if(
                service._enabled
                && !elContains(state._enabledServices[categoryName], serviceName)
                && isFunction(onReject)
            ){
                service._enabled = false;
                onReject();
            }

        }
    }

    if(!globalObj._config.manageScriptTags)
        return;

    const scripts = state._allScriptTags;

    let acceptedCategories = mustEnableCategories
        || state._savedCookieContent.categories
        || [];

    /**
     * Load scripts (sequentially), using a recursive function
     * which loops through the scripts array
     * @param {Element[]} scripts scripts to load
     * @param {number} index current script to load
     */
    const loadScriptsHelper = (scripts, index) => {
        if(index < scripts.length){

            const currScript = scripts[index];
            const currScriptInfo = state._allScriptTagsInfo[index];
            const currScriptCategory = currScriptInfo._categoryName;
            const currScriptService = currScriptInfo._serviceName;
            const categoryAccepted = elContains(acceptedCategories, currScriptCategory);
            const serviceAccepted = currScriptService
                ? elContains(enabledServices[currScriptCategory], currScriptService)
                : false;

            /**
             * Skip script if it was already executed
             */
            if(!currScriptInfo._executed){

                let categoryWasJustEnabled = !currScriptService
                    && !currScriptInfo._runOnDisable
                    && categoryAccepted;

                let serviceWasJustEnabled = currScriptService
                    && !currScriptInfo._runOnDisable
                    && serviceAccepted;

                let categoryWasJustDisabled = !currScriptService
                    && currScriptInfo._runOnDisable
                    && !categoryAccepted
                    && elContains(state._lastChangedCategoryNames, currScriptCategory);

                let serviceWasJustDisabled = currScriptService
                    && currScriptInfo._runOnDisable
                    && !serviceAccepted
                    && elContains(state._lastChangedServices[currScriptCategory] || [], currScriptService);

                if(
                    categoryWasJustEnabled
                    || categoryWasJustDisabled
                    || serviceWasJustEnabled
                    || serviceWasJustDisabled
                ){

                    currScriptInfo._executed = true;

                    const dataType = getAttribute(currScript, 'type', true);

                    removeAttribute(currScript, 'type', !!dataType);
                    removeAttribute(currScript, SCRIPT_TAG_SELECTOR);

                    // Get current script data-src (if there is one)
                    let src = getAttribute(currScript, 'src', true);

                    // Some scripts (like ga) might throw warning if data-src is present
                    src && removeAttribute(currScript, 'src', true);

                    /**
                     * Fresh script
                     * @type {HTMLScriptElement}
                     */
                    const freshScript = createNode('script');

                    freshScript.textContent = currScript.innerHTML;

                    //Copy attributes over to the new "revived" script
                    for(const {nodeName} of currScript.attributes){
                        setAttribute(
                            freshScript,
                            nodeName,
                            currScript[nodeName] || getAttribute(currScript, nodeName)
                        );
                    }

                    /**
                     * Set custom type
                     */
                    dataType && (freshScript.type = dataType);

                    // Set src (if data-src found)
                    src
                        ? (freshScript.src = src)
                        : (src = currScript.src);

                    // If script has valid "src" attribute
                    // try loading it sequentially
                    if(src){
                        // load script sequentially => the next script will not be loaded
                        // until the current's script onload event triggers
                        freshScript.onload = freshScript.onerror = () => {
                            loadScriptsHelper(scripts, ++index);
                        };
                    }

                    // Replace current "sleeping" script with the new "revived" one
                    currScript.replaceWith(freshScript);

                    /**
                     * If we managed to get here and src is still set, it means that
                     * the script is loading/loaded sequentially so don't go any further
                     */
                    if(src)
                        return;
                }
            }

            // Go to next script right away
            loadScriptsHelper(scripts, ++index);
        }
    };

    loadScriptsHelper(scripts, 0);
};

/**
 * Keep track of categories enabled by default (useful when mode==OPT_OUT_MODE)
 */
export const retrieveEnabledCategoriesAndServices = () => {
    const state = globalObj._state;

    for(const categoryName of state._allCategoryNames){
        const category = state._allDefinedCategories[categoryName];

        if(category.enabled){
            state._defaultEnabledCategories.push(categoryName);

            const services = state._allDefinedServices[categoryName] || {};

            for(let serviceName in services){
                state._enabledServices[categoryName].push(serviceName);
            }
        }
    }
};