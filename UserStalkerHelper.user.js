// ==UserScript==
// @name         User Stalker Helper
// @namespace    https://github.com/SOBotics/UserStalker
// @description  Helper userscript for interacting with reports from the User Stalker bot posted in certain Stack Exchange chat rooms.
// @author       Cody Gray
// @contributor  Oleg Valter
// @contributor  VLAZ
// @version      3.0.5
// @homepageURL  https://github.com/SOBotics/UserStalkerHelper
// @updateURL    https://github.com/SOBotics/UserStalkerHelper/raw/master/UserStalkerHelper.user.js
// @downloadURL  https://github.com/SOBotics/UserStalkerHelper/raw/master/UserStalkerHelper.user.js
// @supportURL   https://github.com/SOBotics/UserStalkerHelper/issues
// @icon         https://raw.githubusercontent.com/SOBotics/UserStalkerHelper/master/UserStalkerHelper.png
// @icon64       https://raw.githubusercontent.com/SOBotics/UserStalkerHelper/master/UserStalkerHelper64.png
//
// @match        http*://chat.stackexchange.com/rooms/59667/*
// @match        http*://chat.stackexchange.com/transcript/59667
// @match        http*://chat.stackexchange.com/search*room=59667
//
// @match        http*://chat.stackoverflow.com/rooms/239107/*
// @match        http*://chat.stackoverflow.com/transcript/239107
// @match        http*://chat.stackoverflow.com/search*room=239107
//
// @match        http*://chat.stackoverflow.com/rooms/239425/*
// @match        http*://chat.stackoverflow.com/transcript/239425
// @match        http*://chat.stackoverflow.com/search*room=239425
//
// @include      /^https?:\/\/chat\.stackexchange\.com\/(?:rooms\/|search.*[?&]room=|transcript\/)(?:59667)(?:[&\/].*$|$)/
// @include      /^https?:\/\/chat\.stackoverflow\.com\/(?:rooms\/|search.*[?&]room=|transcript\/)(?:239107|239425)(?:[&\/].*$|$)/
//
// @connect      stackoverflow.com
// @connect      superuser.com
// @connect      serverfault.com
// @connect      askubuntu.com
// @connect      mathoverflow.net
// @connect      stackexchange.com
//
// @require      https://unpkg.com/sweetalert/dist/sweetalert.min.js
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==
/* eslint-disable no-multi-spaces */
/* global $:readonly    */  // SO/SE sites always provides jQuery, free-of-charge
/* global CHAT:readonly */  // \ these two global objects always
/* global fkey:readonly */  // /  exist on SO/SE chat.* domains
/* global swal:readonly */  // defined by the @required "sweetalert" library

(() =>
{
   /**********************************************
    * Global Constants
    **********************************************/

   'use strict';

   // Registered on Stack Apps in order to obtain an API key.
   // Client ID is 21280 (https://stackapps.com/apps/oauth/view/21280)
   const SE_API_KEY          = 'F9msnTSnUmKMKD7BnjHAxA((';
   const GM_XML_HTTP_REQUEST = ((typeof GM !== 'undefined') ? GM.xmlHttpRequest.bind(GM)
                                                            : GM_xmlhttpRequest);  /* eslint-disable-line no-undef */
   const IS_TRANSCRIPT       = window.location.pathname.startsWith('/transcript');
   const IS_SEARCH           = window.location.pathname.startsWith('/search');
   const BOT_ACCOUNT_ID      = {
                                  'chat.stackexchange.com': 530642,
                                  'chat.stackoverflow.com': 17363584,
                               }[window.location.hostname];
   const BOMB_EMOJI          = String.fromCodePoint(0x1F4A3);
   const BOMB_IMAGE_URL      = 'https://raw.githubusercontent.com/joypixels/emoji-assets/master/png/32/1f4a3.png';
   const RENAME_EMOJI        = String.fromCodePoint(0x1F4DD);
   const RENAME_IMAGE_URL    = 'https://raw.githubusercontent.com/joypixels/emoji-assets/master/png/32/1f4dd.png';
   const CHECK_EMOJI         = String.fromCodePoint(0x2714);
   const CHECK_IMAGE_URL     = 'https://raw.githubusercontent.com/joypixels/emoji-assets/master/png/32/2714.png';
   const DESTROY_OPTIONS     =
   {
      spammer:
      {
         description  : 'Spam in user profile.',
         templateName : 'destroy spammer',
         suspendReason: 'for promotional content',
      },
      evasion:
      {
         description  : 'Recreated troll and/or suspension-evasion account.',
         templateName : 'no longer welcome',
         suspendReason: 'because of low-quality contributions',
      },
      custom:
      {
         description  : 'A custom reason:',
         templateName : 'destroy user',
         suspendReason: 'for rule violations',
      },
   };

   /**********************************************
    * Initialization
    **********************************************/

   // Attempt to restrict the running of this script to users with moderator privileges.
   // Unfortunately, there's no way to detect whether the current user is a moderator
   // from the transcript pages, so we just punt in that case. It cannot actually do
   // any *harm* to run this script without moderator privileges; it just won't do
   // any *good*, either.
   if (!((CHAT?.RoomUsers?.current?.().is_moderator)           /* for normal room */ ||
         (($('.topbar-menu-links').text().includes('\u2666'))) /* for search      */ ||
         (CHAT && IS_TRANSCRIPT)                               /* for transcript  */))
   {
      return;
   }

   (() =>  // initialization function
   {
      appendStyles();

      $('#getmore, #getmore-mine').click(() => decorateExistingMessages(500));

      $('body').on('click', 'img.userstalker-nuke-button'  , onClickNukeButton);
      $('body').on('click', 'img.userstalker-rename-button', onClickRenameButton);
      $('body').on('click', 'span.userstalker-check-button', onClickCheckButton);

      decorateExistingMessages(0);

      if (CHAT?.addEventHandlerHook)
      {
         CHAT.addEventHandlerHook(chatMessageListener);
      }
   }
   )(window);

   /**********************************************
    * Chat Message Listeners & Decorators
    **********************************************/

   function chatMessageListener({event_type, user_id, message_id})
   {
      if ((event_type === 1) && (user_id === BOT_ACCOUNT_ID))
      {
         setTimeout(() => { decorateChatMessage($(`#message-${message_id}`)); });
      }
   }

   function decorateExistingMessages(timeout)
   {
      decorateChatMessages();

      const chat = $(/^\/(?:search|users)/.test(window.location.pathname) ? '#content'
                                                                          : '#chat, #transcript');
      chat.one('DOMSubtreeModified', () =>
      {
         // A second timeout is required because the first modification
         // to the DOM occurs before the chat messages have been loaded.
         setTimeout(() =>
         {
            if (chat.html().length > 0)  { decorateChatMessages(); }
            else                         { setTimeout(decorateExistingMessages, timeout, timeout); }
         }, timeout);
      });
   }

   function decorateChatMessages()
   {
      $(`.user-${BOT_ACCOUNT_ID} .message`).each((i, element) => decorateChatMessage(element));
   }

   function decorateChatMessage(message)
   {
      const $message  = $(message);
      const messageId = $message.attr('id').replace(/^(message-)/, '');
      if (!($message.find('.userstalker-nuke-button').length))
      {
         // Match only <a>s that are direct descendants of .content in order to
         // exclude those <a>s that are wrapped within a <strike>.
         const userLink = $message.find('.content > a + a[href*="/users/"]');
         if (userLink.length > 0)
         {
            const userUrl     = userLink.attr('href');
            const content     = userLink.parent();
            const contentHtml = content.html();
            const pattern     = /(User Stalker<\/a> \] (?!✔ )?)(✔ )?(?!<strike>)/;
            content.html(contentHtml.replace(pattern,
                                             function($0, $1, $2)
                                             {
                                                return $1
                                                     + '&nbsp;'
                                                     + '<img class="userstalker-nuke-button"'
                                                     + ` src="${BOMB_IMAGE_URL}"`
                                                     + ` alt="${BOMB_EMOJI}"`
                                                     + ' title="destroy this user account"'
                                                     + ' width="32" height="32"'
                                                     + ` data-messageid="${messageId}"`
                                                     + ` data-userurl="${userUrl}"`
                                                     + '>'
                                                     + '&nbsp;'

                                                     + ($2 ?? '<img class="userstalker-rename-button"'
                                                     +        ` src="${RENAME_IMAGE_URL}"`
                                                     +        ` alt="${RENAME_EMOJI}"`
                                                     +        ' title="reset the display name and send the user a boilerplate message about it"'
                                                     +        ' width="32" height="32"'
                                                     +        ` data-messageid="${messageId}"`
                                                     +        ` data-userurl="${userUrl}"`
                                                     +        '>'
                                                     +        '&nbsp;'
                                                     +        '<span class="userstalker-check-button"'
                                                     +        ' title="mark this user account as appearing to be legitimate"'
                                                     +        ` data-messageid="${messageId}"`
                                                     +        ` data-userurl="${userUrl}"`
                                                     +        `>${CHECK_EMOJI}</span>`
                                                     +        '&nbsp;')
                                                     + '&nbsp;';
                                             }));

            // The transcript and search pages don't open links in a new window by default,
            // so fix that. Although it is normally considered dreadful behavior to wrest
            // this control out of the user's hands, in this case, we don't want to lose
            // our place in the transcript, and if one is used to handling it from the
            // room view (where links do open in a new window by default), one might be
            // caught very off-guard and end up all discombobulated. Can't have that!
            if (IS_TRANSCRIPT || IS_SEARCH)
            {
               userLink[0].setAttribute('target', '_blank');
            }
         }
      }
   }

   /**********************************************
    * Chat Helper Functions
    **********************************************/

   /**
    * Retrieves the fkey for the current (moderator) user's chat account on the current chat server.
    */
   async function getChatFkey()
   {
      if (fkey?.fkey)
      {
         return fkey.fkey();
      }

      // The "search" page does not define the user's chat FKEY anywhere,
      // so we need to fetch it from a page that does.
      const result = await GM_XML_HTTP_REQUEST(
      {
         method : 'GET',
         url    : window.location.origin,
      });

      const fkeyInput = $(result.response).find('input#fkey');
      if (fkeyInput.length)
      {
         return fkeyInput.val();
      }

      // TODO: Remove alert from this and other helper functions;
      //       centralize error reporting in one place.
      alert('Failed to get your chat account\'s FKEY.');
      throw new Error('Failed to get your chat account\'s FKEY.');
   }

   /**
    * Retrieves the contents of a chat message on the current chat server.
    * @param {string} fkeyChat   The fkey for the current (moderator) user on the chat server.
    * @param {number} messageId  The ID of the chat message to retrieve.
    */
   async function getChatMessageText(fkeyChat, messageId)
   {
      const params = new URLSearchParams(
      {
         fkey : fkeyChat,
         plain: 'true',
      });

      const url  = new URL(`${window.location.origin}/message/${messageId}`);
      url.search = params.toString();

      const result = await GM_XML_HTTP_REQUEST(
      {
         method : 'GET',
         url    : url.toString()
      });

      if (!(result?.response))
      {
         throw new Error('Failed to get the text of the specified chat message.');
      }
      return result.response;
   }

   /**
    * Edits the contents of a chat message on the current chat server.
    * @param {string} fkeyChat     The fkey for the current (moderator) user on the chat server.
    * @param {number} messageId    The ID of the chat message to edit.
    * @param {string} messageText  The new contents of the chat message.
    */
   async function editChatMessage(fkeyChat, messageId, messageText)
   {
      do
      {
         for (let attempts = 0; attempts < 5; ++attempts)
         {
            try
            {
               const result = await Promise.resolve($.post(`${window.location.origin}/messages/${messageId}`,
                                                    {
                                                      fkey: fkeyChat,
                                                      text: messageText,
                                                    }));

               if (result)
               {
                  // The transcript and search pages do not auto-update when a message is edited,
                  // so force a refresh at this point.
                  if (IS_TRANSCRIPT || IS_SEARCH)
                  {
                     setTimeout(() => { window.location.reload(); },
                                1000);
                  }

                  return;
               }
               else
               {
                  alert('DEBUG: Operation failed, without throwing an exception. This should probably be investigated, as it was not the expected behavior.');
                  throw new Error('Failed to edit chat message.');
               }
            }
            catch (ex)
            {
               const timeout = (2 * (attempts + 1));
               console.warn(`Failed to edit chat message; trying again in ${timeout} seconds.`);
               await new Promise((result) => setTimeout(result, (timeout * 1000)));
            }
         }
      } while (confirm('Failed to edit chat message, despite multiple retries. Do you want to try again now?'));
   }

   /**
    * Edits a chat message from the User Stalker bot on the current chat server to prepend and/or append text in the appropriate places.
    * @param {number} messageId      The ID of the chat message to edit.
    * @param {string} messagePrefix  The string to prepend to the chat message.
    * @param {string} messageSuffix  The string to append to the chat message.
    */
   async function bookendChatMessage(messageId, messagePrefix, messageSuffix)
   {
      const fkeyChat    = await getChatFkey();
      const messageText = await getChatMessageText(fkeyChat, messageId);
      const messageTag  = messageText.match(/\[ \[.*\]\(.*\) \] /)[0];
      if (!messageTag)
      {
         throw new Error('Failed to find expected pattern in chat message from User Stalker bot.');
      }
      const messageContents = messageText.slice(messageTag.length);
      return editChatMessage(fkeyChat,
                             messageId,
                             `${messageTag}${messagePrefix}${messageContents}${messageSuffix}`);
   }

   /**
    * Edits a chat message from the User Stalker bot on the current chat server to add strike-through formatting.
    * @param {number} messageId  The ID of the chat message to edit.
    */
   async function strikeoutChatMessage(messageId)
   {
      const STRIKEOUT_MARKDOWN = '---';
      return bookendChatMessage(messageId, STRIKEOUT_MARKDOWN, STRIKEOUT_MARKDOWN);
   }

   /**
    * Edits a chat message from the User Stalker bot on the current chat server to add a checkmark.
    * @param {number} messageId  The ID of the chat message to edit.
    */
   async function checkmarkChatMessage(messageId)
   {
      return bookendChatMessage(messageId, `${CHECK_EMOJI} `, '');
   }

   /**********************************************
    * Main Site General Helper Functions
    **********************************************/

   function getUserIdFromUrl(userUrl)
   {
      return Number(userUrl.match(/(?:\/u(?:sers)?\/)(-?\d+)\//)[1]);
   }

   /**
    * Retrieves the "ticks" value from the specified site.
    * @param {string} siteHostname  The full host name of a main site.
    */
   async function getTicks(siteHostname)
   {
      if (siteHostname == null)
      {
         throw new Error('The required "siteHostname" parameter is missing.');
      }

      const result = await GM_XML_HTTP_REQUEST(
      {
         method : 'GET',
         url    : `//${siteHostname}/questions/ticks`,
      });

      if (!(result?.response))
      {
         throw new Error('Failed to retrieve "ticks" value.');
      }
      return result.response;
   }

   /**
    * Retrieves the fkey for the current user's account on the specified site.
    * @param {string} siteHostname  The full host name of a main site.
    */
   async function getMainSiteFkey(siteHostname)
   {
      if (siteHostname == null)
      {
         throw new Error('The required "siteHostname" parameter is missing.');
      }

      const result = await GM_XML_HTTP_REQUEST(
      {
         method : 'GET',
         url    : `//${siteHostname}`
      });

      const fkeyInput = $(result.response).find('input[name="fkey"]');
      if (!fkeyInput)
      {
         throw new Error('Failed to retrieve "fkey" value for main site.');
      }
      return fkeyInput.val();
    }

   /**********************************************
    * SE API Helper Functions
    **********************************************/

   /**
    * Retrieves information for the specified user account on the specified site.
    * @param {string} siteHostname  The full host name of a main site.
    * @param {number} userId        The ID of the user account to retrieve information about.
    */
   function getUserInfofromApi(siteHostname, userId)
   {
      return new Promise(function(resolve, reject)
      {
         if ((siteHostname == null) ||
             (userId       == null))
         {
            reject();
         }

         // NOTE: Must be explicitly prefixed with "https://" in order to avoid a
         //       CORS violation. Yes, even though the current protocol for the
         //       page is already "https://"...
         $.get(`https://api.stackexchange.com/2.3/users/${userId}?`
                + `&site=${siteHostname}`
                + '&sort=creation'
                + '&order=desc'
                + '&filter=!0QpX)x1ay6IhAe)0*WS(wn'
                + `${SE_API_KEY ? `&key=${SE_API_KEY}` : ''}`)
         .done((data) =>
         {
            if (data.items[0].user_id == userId)
            {
               resolve(data.items[0]);
            }
            else
            {
               reject();
            }
         })
         .fail(reject);
      });
   }

   /**********************************************
    * Main Site User-Specific Helper Functions
    **********************************************/

   /**
    * Retrieves PII for the specified user account on the specified site.
    * @param {string} mainSiteFkey  The fkey for the current (moderator) user on the main site.
    * @param {string} siteHostname  The full host name of a main site.
    * @param {number} userId        The ID of the user account to retrieve information about.
    */
   async function getUserPii(mainSiteFkey, siteHostname, userId)
   {
      if ((mainSiteFkey == null) ||
          (siteHostname == null) ||
          (userId       == null))
      {
         throw new Error('One or more required parameters is missing.');
      }

      const data = new URLSearchParams(
      {
         'fkey': mainSiteFkey,
         'id'  : userId.toString(),
      });
      const result = await GM_XML_HTTP_REQUEST(
      {
         method : 'POST',
         url    : `//${siteHostname}/admin/all-pii`,
         headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
         data   : data.toString()
      });

      const html = $(result.responseText);
      const ip   = html.find('div:contains("IP Address:") + div > span.ip-address-lookup');
      return { name  : html.find('div:contains("Real Name:") + div > a').text().trim(),
               email : html.find('div:contains("Email:") + div > a').text().trim(),
               ip    : ip.text().trim(),
               tor   : ip.data('tor').trim(),
             };
   }

   /**
    * Edits the profile for the specified user account on the specified site.
    * @param {string} mainSiteFkey  The fkey for the current (moderator) user on the main site.
    * @param {string} siteHostname  The full host name of a main site.
    * @param {number} userId        The ID of the user account to edit.
    * @param {object} profileData   The user profile data fields, to pass as the "data" for the request.
    */
   async function editUserInfo(mainSiteFkey, siteHostname, userId, profileData)
   {
      if ((mainSiteFkey == null) ||
          (siteHostname == null) ||
          (userId       == null))
      {
         throw new Error('One or more required parameters is missing.');
      }

      // Get "ticks" value, which substitutes for the hidden "i1l" field on the
      // user profile "edit" page, which cannot be retrieved programmatically.
      const ticks = await getTicks(siteHostname);

      // A delay of at least 2 seconds is required between fetching the "ticks"
      // value and submitting the edit to the profile. This is an old bug that
      // manifests not only programmatically, but also when attempting to edit
      // the profile using the web interface. Apparently, this throttle is a
      // "security" measure. See: https://meta.stackexchange.com/q/223761 and
      // https://meta.stackexchange.com/q/183508, with answers by (former)
      // SE developers.
      await new Promise((result) => setTimeout(result, 2000));

      // Ensure that certain fields in the specified data are set properly.
      profileData.set('fkey', mainSiteFkey);
      profileData.set('i1l', ticks);

      // Submit the request to edit the user profile.
      return GM_XML_HTTP_REQUEST(
      {
         method : 'POST',
         url    : `//${siteHostname}/users/edit/${userId}/post`,
         headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
         data   : profileData.toString()
      });
   }

   /**
    * Edits the profile for the specified user account on the specified site, resetting the display name to the default (auto-generated) value.
    * @param {string} mainSiteFkey  The fkey for the current (moderator) user on the main site.
    * @param {string} siteHostname  The full host name of a main site.
    * @param {number} userId        The ID of the user account to edit.
    */
   async function resetUserDisplayName(mainSiteFkey, siteHostname, userId)
   {
      const profileData = new URLSearchParams(
      {
         'fields'         : '',
         'author'         : '',
         'push'           : true,       // copy changes to all sites
         'DisplayName'    : '',         // clear this field (will implicitly set to default/auto)
       //'RealName'       : '',         // do not reset this field
       //'ProfileImageUrl': '',         // do not reset this field
       //'Location'       : '',         // do not reset this field
       //'LocationPlaceId': '',         // do not reset this field
       //'Title'          : '',         // do not reset this field
       //'WebsiteUrl'     : '',         // do not reset this field
       //'TwitterUrl'     : '',         // do not reset this field
       //'GitHubUrl'      : '',         // do not reset this field
       //'AboutMe'        : '',         // do not reset this field
      });
      return editUserInfo(mainSiteFkey, siteHostname, userId, profileData);
   }

   /**
    * Edits the profile for the specified user account on the specified site, removing all fields that might contain spam.
    * @param {string} mainSiteFkey  The fkey for the current (moderator) user on the main site.
    * @param {string} siteHostname  The full host name of a main site.
    * @param {number} userId        The ID of the user account to edit.
    */
   async function bowdlerizeUserInfo(mainSiteFkey, siteHostname, userId)
   {
      const profileData = new URLSearchParams(
      {
         'fields'         : '',
         'author'         : '',
         'push'           : true,       // copy changes to all sites
         'DisplayName'    : 'Spammer',
       //'RealName'       : '',         // do not reset this field
         'ProfileImageUrl': '',
         'Location'       : '',
         'LocationPlaceId': '',
         'Title'          : '',
         'WebsiteUrl'     : '',
         'TwitterUrl'     : '',
         'GitHubUrl'      : '',
         'AboutMe'        : '',
      });
      return editUserInfo(mainSiteFkey, siteHostname, userId, profileData);
   }

   function sendModMessage(mainSiteFkey,
                           siteHostname,
                           userId,
                           templateName  = '',
                           suspendReason = 'for rule violations',
                           message       = '',
                           sendEmail     = true,
                           suspendDays   = 0)
   {
      return new Promise(function(resolve, reject)
      {
          if ((mainSiteFkey == null) ||
              (siteHostname == null) ||
              (userId       == null))
          {
             reject();
          }

         if ((templateName == null) || (templateName.trim().length === 0))
         {
            alert('Mod message template name cannot be empty.');
            reject();
         }

         if ((suspendReason == null) || (suspendReason.trim().length === 0))
         {
            alert('Mod message suspension reason cannot be empty.');
            reject();
         }

         if ((message == null) || (message.trim().length === 0))
         {
            alert('Mod message body cannot be empty.');
            reject();
         }

         if ((suspendDays < 0) || (suspendDays > 365))
         {
            alert('Invalid number of days to suspend.');
            reject();
         }

         const data = new URLSearchParams(
         {
            'fkey'           : mainSiteFkey,
            'userId'         : userId,
            'lastMessageDate': 0,
            'email'          : sendEmail,
            'suspendUser'    : (suspendDays > 0),
            'suspend-choice' : ((suspendDays > 0) ? suspendDays : 0),
            'suspendDays'    : suspendDays,
            'templateName'   : templateName,
            'suspendReason'  : suspendReason,
            'templateEdited' : false,
            'post-text'      : message,
            'author'         : null,
         });
         GM_XML_HTTP_REQUEST(
         {
            method : 'POST',
            url    : `//${siteHostname}/users/message/save`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            data   : data.toString(),
            onload : resolve,
            onerror: reject,
            onabort: reject,
         });
      });
   }

   async function destroyUserHelper(mainSiteFkey,
                                    siteHostname,
                                    userInfo,
                                    details)
   {
      do
      {
         for (let attempts = 0; attempts < 10; ++attempts)
         {
            try
            {
               const data = new URLSearchParams(
               {
                  'fkey'                : mainSiteFkey,
                  'annotation'          : '',
                  'deleteReasonDetails' : '',
                  'mod-actions'         : 'destroy',
                  'destroyReason'       : 'This user was created to post spam or nonsense and has no other positive participation',
                  'destroyReasonDetails': details,
               });

               const result = await GM_XML_HTTP_REQUEST(
               {
                  method : 'POST',
                  url    : `//${siteHostname}/admin/users/${userInfo.user_id}/destroy`,
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                  data   : data.toString(),
               });

               if ((result != null) && (result.status == 200))
               {
                  return true;
               }
               else
               {
                  throw new Error(`Failed to destroy user account: API returned error ${result.status}.`);
               }
            }
            catch (ex)
            {
               const timeout = (attempts + 1);
               console.warn(ex + ` Trying again in ${timeout} second(s).`);
               await new Promise((result) => setTimeout(result, (timeout * 1000)));
            }
         }
      } while (confirm('Failed to destroy user account, despite multiple retries. Do you want to try again now?'));
      return false;
   }

   function destroyUser(mainSiteFkey,
                        siteHostname,
                        userInfo,
                        bowdlerizeFirst = false,
                        destroyDetails  = null)
   {
      return new Promise(function(resolve, reject)
      {
          if ((mainSiteFkey      == null) ||
              (siteHostname      == null) ||
              (userInfo?.user_id == null))
          {
             reject();
          }

         // If destroyDetails was not provided, prompt user interactively for additional details.
         if ((destroyDetails == null) || (!destroyDetails.trim().length))
         {
            destroyDetails = prompt('Please enter a more detailed message to include with the destroyed user record, if desired.' +
                                    '\n' +
                                    '(Cancel button safely terminates without destroying the account.)');
         }

         // If destroyDetails is still not provided, reject the promise and return early.
         if (destroyDetails == null)
         {
            alert('Destroy operation cancelled: user was not destroyed.');
            reject();
         }

         // Retrieve user PII, and record it in the additional details, to work around the fact
         // that the system does not record this or make it accessible after account deletion.
         // TODO: Retrieve "past names"!
         // TODO: Retrieve "Title" field from profile. (Unfortunately, this field cannot be
         //       retrieved from the SE /users API, presumably because it is SO-only, so
         //       it must be scraped from the user's profile page on the site proper.)
         getUserPii(mainSiteFkey, siteHostname, userInfo.user_id)
         .then((pii) =>
         {
            (bowdlerizeFirst ? bowdlerizeUserInfo(mainSiteFkey, siteHostname, userInfo.user_id)
                             : Promise.resolve())
            .then(() =>
            {
               const details = destroyDetails.trim()
                               + '\n'
                               + `\nReal Name:        ${pii.name}`
                               + `\nEmail Address:    ${pii.email}`
                               + `\nIP Address:       ${pii.ip} (tor: ${pii.tor})`
                               + `\nCreation Date:    ${userInfo.creation_date}`
                               + `\nProfile Location: ${userInfo.location}`
                               + `\nWebsite URL:      ${userInfo.website_url}`
                               + `\nAvatar Image:     ${userInfo.profile_image}`
                               ;
               destroyUserHelper(mainSiteFkey, siteHostname, userInfo, details)
               .then(resolve)
               .catch(reject);
            })
            .catch(reject);
         })
         .catch(reject);
      });
   }

   function nukeUser(mainSiteFkey,
                     siteHostname,
                     userInfo,
                     bowdlerizeFirst,
                     destroyDetails = null,
                     templateName   = null,
                     suspendReason  = null)
   {
      return new Promise(function(resolve, reject)
      {
         // If requested, apply the maximum suspension period (1 year) before destroying the account,
         // skipping the sending of an email to the user's registered email address. Although most
         // users won't see this message (since it'll only be displayed on the site, and we're about
         // to destroy their account), it is possible they see it upon re-creation of the account.
         // In that case, they can only see the  first few words of the message in the global inbox
         // (the system will notify them of a new message, though); they *cannot* click on the inbox
         // item to view the full message. Therefore, we must keep it *very* short, if they are to
         // be able to see anything. It's difficult to give much guidance, but this is a pretty good
         // compromise. It is all that will fit in the preview, down to the *letter* (i.e., it is
         // essential to use the contraction "you're"; "you are" makes the message too long)!
         // See also: https://chat.stackexchange.com/transcript/message/59625219#59625219
         const suspendFirst = !((templateName == null) && (suspendReason == null));
         (suspendFirst ? sendModMessage(mainSiteFkey,
                                        siteHostname,
                                        userInfo.user_id,
                                        templateName,
                                        suspendReason,
                                        'Account removed for spamming and/or abusive behavior. You\'re no longer welcome to participate here.',
                                        false,
                                        365)
                       : Promise.resolve())
         .then(() =>
         {
            destroyUser(mainSiteFkey, siteHostname, userInfo, bowdlerizeFirst, destroyDetails)
            .then(resolve)
            .catch(reject);
         })
         .catch(reject);
      });
   }

   /**********************************************
    * Userscript UI & Handlers: Nuke Button
    **********************************************/

   function createDestroyOptions()
   {
      // Iterate through all of the properties in DESTROY_OPTIONS and create
      // the appropriate DOM elements for each of them. Also wire up listeners
      // for the "click" events.
      const table = document.createElement('table');
      for (let destroyOption in DESTROY_OPTIONS)
      {
         if (Object.prototype.hasOwnProperty.call(DESTROY_OPTIONS, destroyOption))
         {
            const id      = destroyOption;
            const row     = document.createElement('tr');
            row.innerHTML = `<td>
                               <input type  = "radio"
                                      name  = "userstalker-destroy-reason"
                                      value = "${id}"
                                      id    = "${id}"
                               />
                               <label for="${id}">
                                 ${DESTROY_OPTIONS[destroyOption].description}
                                 ${(id === 'custom')
                                    ? '<textarea '
                                      + ' autocapitalize="sentences"'
                                      + ' autocomplete="on"'
                                      + ' autocorrect="on"'
                                      + ' placeholder="An optional explanation for why you are destroying the account, to be included with the deleted user profile '
                                      +               '(e.g., &quot;This user\'s profile is filled with Nazi propaganda and other hate speech.&quot;)."'
                                      + '></textarea>'
                                    : ''}
                               </label>
                             </td>`;
            table.appendChild(row);

            row.addEventListener('click', (event) =>
            {
               if (destroyOption !== 'custom')
               {
                  // For the non-custom option, where there's nothing else to do
                  // but submit after choosing one, pre-select the submit button.
                  document.querySelector('.swal-button--danger').focus();
               }
               else
               {
                  // For the custom option, a click on the radio button should
                  // focus the textarea, and a click on the (always-visible)
                  // textarea should select the corresponding radio button.
                  const target = event.target;
                  if (target.tagName === 'INPUT')
                  {
                     row.querySelector('textarea').focus();
                  }
                  else if (target.tagName === 'TEXTAREA')
                  {
                     row.querySelector('input').checked = true;
                  }
               }

               document.querySelector('.swal-content input#userstalker-bowdlerize-toggle').checked = (destroyOption === 'spammer');
               document.querySelector('.swal-content input#userstalker-suspend-toggle')   .checked = (destroyOption !== 'spammer');
            });
         }
      }

      // Default to the first option being selected.
      table.querySelector(`#${Object.keys(DESTROY_OPTIONS)[0]}`).checked = true;

      return table;
   }

   function createDestroyPopupContent()
   {
      const content = createDestroyOptions();

      const instructions = document.createElement('div');
      instructions.classList.add('swal-text');
      instructions.innerHTML = 'The reason you specify here will be saved in the record when this user account is destroyed. '
                               + 'A reason is optional; if you don\'t want to include additional information, '
                               + 'choose the "custom" reason and simply leave the associated textbox blank. '
                               + 'The user\'s PII and other metadata will always be automatically fetched and '
                               + 'included in the record.';
      content.append(instructions);

      const checkboxes = document.createElement('div');
      checkboxes.classList.add('swal-content');
      checkboxes.innerHTML = '<table>' +
                               '<tr>' +
                                 '<td>' +
                                   '<label title="Enabling this option will clear all fields in the user\'s profile to remove spam content and set the display name to &quot;Spammer&quot; before destroying the account. (The original info is still retrieved and recorded in the deleted user record.)">' +
                                     '<input type="checkbox" name="userstalker-bowdlerize-toggle" id="userstalker-bowdlerize-toggle" checked />' +
                                     'Bowdlerize profile and push edits to all sites before destroying' +
                                   '</label>' +
                                 '</td>' +
                               '</tr>' +
                               '<tr>' +
                                 '<td>' +
                                   '<label title="Enabling this option will automatically send a message that suspends the user for the maximum duration that is permitted for moderators (365 days) before destroying the account. This ensures that, even if the destroyed account is re-created at any time within the next year, it will be automatically suspended by the system, thus restricting the account\'s ability to post anything.">' +
                                     '<input type="checkbox" name="userstalker-suspend-toggle" id="userstalker-suspend-toggle" />' +
                                     'Suspend for maximum duration of 1 year before destroying' +
                                   '</label>' +
                                 '</td>' +
                               '</tr>' +
                             '</table>';
      content.append(checkboxes);

      return content;
   }

   function onClickNukeButton()
   {
      const nukeButton       = $(this);
      const chatMessage      = nukeButton.parent();
      const chatMessageText  = chatMessage.text();
      const detectionReasons = chatMessageText.substring(chatMessageText.indexOf('(') + 1,
                                                         chatMessageText.indexOf(')'));
      const messageId        = this.dataset.messageid;
      const userUrl          = this.dataset.userurl;
      const userId           = getUserIdFromUrl(userUrl);
      const siteHostname     = new URL(userUrl).hostname;
      getUserInfofromApi(siteHostname, userId).then((userInfo) =>
      {
         // Disable the built-in chat buttons and input textarea while the dialog is
         // being displayed, in order to prevent inadvertently posting nonsense messages
         // in the chat room, as I've done several times now. (Since the SweetAlert dialog
         // is technically non-modal, its being displayed does not prevent interactions
         // ith the page like a prompt() or alert() dialog would.)
         const chatButtons    = document.getElementById('chat-buttons');
         const chatButtonsAll = chatButtons.querySelectorAll('button');
         const chatInput      = document.getElementById('input');
         chatInput.disabled   = true;
         chatButtonsAll.forEach((btn) => { btn.disabled = true; });
         const reenableChatInput = () =>
         {
            chatInput.disabled = false;
            chatButtonsAll.forEach((btn) => { btn.disabled = false; });
         };

         // Display the confirmation dialog.
         swal(
         {
           title  : 'Destroy the user "' + userInfo.display_name + '" because\u2026',
           buttons:
           {
              confirm:
              {
                 text      : 'Destroy "' + userInfo.display_name + '"',
                 value     : true,
                 visible   : true,
                 closeModal: false,
              },
              cancel:
              {
                 text      : 'Cancel',
                 value     : null,
                 visible   : true,
                 closeModal: true,
              }
           },
           dangerMode         : true,
           closeOnEsc         : true,
           closeOnClickOutside: true,
           content            : createDestroyPopupContent(),
         })
         .then((result) =>
         {
            if (result)
            {
               const selectedReason  = document.querySelector('.swal-content input[name="userstalker-destroy-reason"]:checked').value;
               const selectedDetails = ((selectedReason !== 'custom')
                                          ? DESTROY_OPTIONS[selectedReason].description
                                          : document.querySelector('.swal-content textarea').value
                                       ).trim();
               const stalkerDetails  = `User Stalker found: ${detectionReasons}`;
               const fullDetails     = `${selectedDetails ? selectedDetails + '\n\n' : ''}${stalkerDetails}`;
               const bowdlerizeFirst = document.querySelector('.swal-content input#userstalker-bowdlerize-toggle').checked;
               const suspendFirst    = document.querySelector('.swal-content input#userstalker-suspend-toggle')   .checked;
               const templateName    = (suspendFirst ? DESTROY_OPTIONS[selectedReason].templateName  : null);
               const suspendReason   = (suspendFirst ? DESTROY_OPTIONS[selectedReason].suspendReason : null);
               getMainSiteFkey(siteHostname)
               .then((mainSiteFkey) =>
               {
                  nukeUser(mainSiteFkey,
                           siteHostname,
                           userInfo,
                           bowdlerizeFirst,
                           fullDetails,
                           templateName,
                           suspendReason)
                  .then(() =>
                  {
                     strikeoutChatMessage(messageId).then(() =>
                     {
                        nukeButton.remove();

                        swal.stopLoading();
                        swal.close();
                        reenableChatInput();
                     })
                     .catch((ex) =>
                     {
                        alert('Failed to edit the bot\'s chat message to add strike-out formatting.\n\n' + ex);

                        swal.stopLoading();
                        swal.close();
                        reenableChatInput();
                     });
                  })
                  .catch((ex) =>
                  {
                     alert('Failed to nuke the user.\n\n' + ex);

                     swal.stopLoading();
                     swal.close();
                     reenableChatInput();
                  });
               })
               .catch((ex) =>
               {
                  alert('Failed to get your main site account\'s FKEY.\n\n' + ex);

                  swal.stopLoading();
                  swal.close();
                  reenableChatInput();
               });
            }
            else
            {
               reenableChatInput();
            }
         });
      })
      .catch((ex) =>
      {
         alert('Failed to get the display name of the user to nuke from the SE API.\n\n' + ex);
      });
   }

   /**********************************************
    * Userscript UI & Handlers: Rename Button
    **********************************************/

   function onClickRenameButton()
   {
      const renameButton = $(this);
      const chatMessage  = renameButton.parent();
      const messageId    = this.dataset.messageid;
      const userUrl      = this.dataset.userurl;
      const userId       = getUserIdFromUrl(userUrl);
      const siteHostname = new URL(userUrl).hostname;
      getUserInfofromApi(siteHostname, userId).then((userInfo) =>
      {
         if (confirm(`Reset the display name for the user account "${userInfo.display_name}" to its default (automatically-generated) value (i.e., "userXXXXXX"), `
                   + 'and send the user a boilerplate message informing them of the change and reminding them of the Code of Conduct?'))
         {
            getMainSiteFkey(siteHostname)
            .then((mainSiteFkey) =>
            {
               const url = new URL(userUrl);
               sendModMessage(mainSiteFkey,
                              siteHostname,
                              userInfo.user_id,
                              'inappropriate user name',
                              'for rule violations',
                              'Hello,\n'
                            + '\n'
                            + 'We\'re writing in reference to your account:\n'
                            + '\n'
                            + `https://${url.hostname}${url.pathname}\n`
                            + '\n'
                            + `A moderator has reviewed your account and determined that the user name you chose was inappropriate. While you should feel free to express your personal identity, this is a family-friendly site and all user names must comply with our <a href="https://${siteHostname}/conduct">Code of Conduct</a>. We cannot make any exceptions to this policy, regardless of what your intentions may be.\n`
                            + '\n'
                            + 'Therefore, we will be resetting your user name to a default, automatically-generated value that is based on your unique numeric user ID.\n'
                            + '\n'
                            + 'You may keep this default name, or you may choose a new one, if you like. However, please ensure that any name you choose is an appropriate way to represent yourself on this site, that it <a href="https://meta.stackexchange.com/questions/22232/">does not use expletives</a> or other harsh language, and that it does not defame other users or groups. If you have any questions about this policy, please let us know.\n'
                            + '\n'
                            + 'Regards,  \n'
                            + 'The Moderation Team',
                              true,
                              0)
               .then(() =>
               {
                  resetUserDisplayName(mainSiteFkey, siteHostname, userInfo.user_id)
                  .then(() =>
                  {
                     checkmarkChatMessage(messageId).then(() =>
                     {
                        renameButton.remove();
                     })
                     .catch((ex) =>
                     {
                        alert('Failed to edit the bot\'s chat message to add a checkmark.\n\n' + ex);
                     });
                  })
                  .catch((ex) =>
                  {
                     alert('Failed to change the user\'s display name.\n\n' + ex);
                  });
               })
               .catch((ex) =>
               {
                  alert('Failed to send the user a moderator message.\n\n' + ex);
               });
            })
            .catch((ex) =>
            {
               alert('Failed to get your main site account\'s FKEY.\n\n' + ex);
            })
         }
      })
      .catch((ex) =>
      {
         alert('Failed to get the display name of the user to validate from the SE API.\n\n' + ex);
      });
   }

   /**********************************************
    * Userscript UI & Handlers: Check Button
    **********************************************/

   function onClickCheckButton()
   {
      const checkButton  = $(this);
      const chatMessage  = checkButton.parent();
      const messageId    = this.dataset.messageid;
      const userUrl      = this.dataset.userurl;
      const userId       = getUserIdFromUrl(userUrl);
      const siteHostname = new URL(userUrl).hostname;
      getUserInfofromApi(siteHostname, userId).then((userInfo) =>
      {
         if (confirm(`Mark the user account "${userInfo.display_name}" as appearing to be legitimate?`))
         {
            checkmarkChatMessage(messageId).then(() =>
            {
               checkButton.remove();
            })
            .catch((ex) =>
            {
               alert('Failed to edit the bot\'s chat message to add a checkmark.\n\n' + ex);
            });
         }
      })
      .catch((ex) =>
      {
         alert('Failed to get the display name of the user to validate from the SE API.\n\n' + ex);
      });
   }

   /**********************************************
    * Userscript UI & Handlers: Styles
    **********************************************/

   function appendStyles()
   {
      const styles = `
<style>
img.userstalker-nuke-button,
img.userstalker-rename-button,
span.userstalker-check-button
{
   cursor: pointer;
}
img.userstalker-nuke-button,
img.userstalker-rename-button
{
   width: 16px;
   height: 16px;
   position: relative;
   top: -3px;
   color: #000000;
   opacity: 0.66;
}
img.userstalker-nuke-button:hover,
img.userstalker-nuke-button:active,
img.userstalker-rename-button:hover,
img.userstalker-rename-button:active
{
   opacity: 1;
}
span.userstalker-check-button
{
   color: #00CC00;
}
span.userstalker-check-button:hover,
span.userstalker-check-button:active
{
   color: #008800;
}

#input:disabled,
#chat-buttons button:disabled
{
   background: inherit;
}

.swal-overlay,
.swal-overlay--show-modal .swal-modal
{
   transition: ease-in-out 0.1s;
   animation: 0;
}
.swal-modal,
.swal-overlay--show-modal .swal-modal
{
   box-sizing: border-box;
   padding: 14px;
   font: inherit;
   will-change: unset;
}
.swal-modal
{
   width: 700px;
}
@media only screen and (max-width: 750px)
{
   .swal-modal
   {
      width: 495px;
   }
}
.swal-title:first-child,
.swal-title:not(:last-child)
{
   font-size: 16px;
   text-align: left;
   margin: 0 0 10px 0;
   padding: 0;
   color: inherit;
}
.swal-content
{
   margin: 0;
   padding: 0;
   color: inherit;
   font-size: 14px;
}
.swal-content table
{
   width: 100%;
}
.swal-content td
{
   display: block;
   text-align: left;
   margin: 5px 0;
}
.swal-content textarea
{
   display: block;
   margin: 5px 0 0 26px;
   width: calc(100% - 52px);
   font: inherit;
   font-weight: normal;
   font-size: 12px;
   height: 80px;
}
.swal-content input[name="userstalker-destroy-reason"]:checked + label
{
   font-weight: 600;
}
.swal-text
{
   max-width: 100%;
   text-align: left;
   font-size: 12px;
   color: #555;
}
.swal-text:last-child
{
   margin: 5px 0 0 0;
   padding: 0;
}
.swal-content:last-child
{
   margin: 15px 0 0 0;
   padding: 0;
   text-align: left;
}
.swal-content input[type="checkbox"]
{
   margin-right: 8px;
}
.swal-footer
{
   margin: 10px 0 0 0;
   padding: 0;
   color: inherit;
   font-size: 14px;
}
.swal-button-container
{
   float: left;
}
.swal-button
{
   padding: 9px 14px;
   font-size: 13px;
}
.swal-button__loader
{
   width: 100%;
   top: 54;
}
</style>
`;
      $('body').append(styles);
   }
})();
