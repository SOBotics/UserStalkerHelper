// ==UserScript==
// @name         UserStalkerHelper
// @namespace    https://github.com/SOBotics/UserStalker
// @description  Helper userscript for interacting with reports from the User Stalker bot.
// @author       Cody Gray
// @contributor  Oleg Valter
// @contributor  VLAZ
// @version      1.0.0
// @updateURL    https://github.com/SOBotics/UserStalkerHelper/raw/master/UserStalkerHelper.user.js
// @downloadURL  https://github.com/SOBotics/UserStalkerHelper/raw/master/UserStalkerHelper.user.js
// @supportURL   https://github.com/SOBotics/UserStalkerHelper/issues
// @include      /^https?:\/\/chat\.stackexchange\.com\/(?:rooms\/|search.*[?&]room=|transcript\/)(?:59667)(?:[&\/].*$|$)/
// @include      /^https?:\/\/chat\.stackoverflow\.com\/(?:rooms\/|search.*[?&]room=|transcript\/)(?:239107)(?:[&\/].*$|$)/
// @require      https://unpkg.com/sweetalert/dist/sweetalert.min.js
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// ==/UserScript==
/* eslint-disable no-multi-spaces */
/* global $:readonly    */  // SO/SE sites always provides jQuery, free-of-charge
/* global CHAT:readonly */  // \ these two global objects always
/* global fkey:readonly */  // /  exist on SO/SE chat.* domains
/* global swal:readonly */  // defined by the @required "sweetalert" library

(() =>
{
   'use strict';

   // Registered on Stack Apps in order to obtain an API key.
   // Client ID is 21280 (https://stackapps.com/apps/oauth/view/21280)
   const SE_API_KEY          = 'F9msnTSnUmKMKD7BnjHAxA((';
   const GM_XML_HTTP_REQUEST = ((typeof GM !== 'undefined') ? GM.xmlHttpRequest.bind(GM)
                                                            : GM_xmlHttpRequest);  /* eslint-disable-line no-undef */
   const HOSTNAME_CHAT       = window.location.hostname;
   const IS_TRANSCRIPT       = window.location.pathname.startsWith('/transcript');
   const IS_SEARCH           = window.location.pathname.startsWith('/search');
   const BOT_ACCOUNT_ID      = {
                                  'chat.stackexchange.com': 530642,
                                  'chat.stackoverflow.com': 17363584,
                               }[HOSTNAME_CHAT];
   const BOMB_EMOJI          = String.fromCodePoint(0x1F4A3);
   const BOMB_IMAGE_URL      = 'https://raw.githubusercontent.com/joypixels/emoji-assets/master/png/32/1f4a3.png';
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

   // Attempt to restrict the running of this script to users with moderator privileges.
   // Unfortunately, there's no way to detect whether the current user is a moderator
   // from the transcript pages, so we just punt in that case. It cannot actually do
   // any *harm* to run this script without moderator privileges; it just won't do
   // any *good*, either.
   if (!((($('.topbar-menu-links').text().includes('?'))) /* for search      */ ||
         (CHAT?.RoomUsers?.current()?.is_moderator)       /* for normal room */ ||
         (CHAT && IS_TRANSCRIPT)                          /* for transcript  */))
   {
      return;
   }

   (() =>  // initialization function
   {
      appendStyles();

      $('#getmore, #getmore-mine').click(() => decorateExistingMessages(500));

      $('body').on('click', 'img.userstalker-nuke-button', onClickNukeButton);

      decorateExistingMessages(0);

      if (CHAT?.addEventHandlerHook)
      {
         CHAT.addEventHandlerHook(chatMessageListener);
      }
   }
   )(window);


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
         const userLink = $message.find('.content > a + a[href*="/users/"]:not([href*="github.com"])');
         if (userLink.length > 0)
         {
            const userUrl = userLink.attr('href');
            userLink.before('&nbsp;'
                            + '<img class="userstalker-nuke-button"'
                            + ` src="${BOMB_IMAGE_URL}"`
                            + ` alt="${BOMB_EMOJI}"`
                            + ' title="destroy this user account"'
                            + ' width="32" height="32"'
                            + ` data-messageid="${messageId}"`
                            + ` data-userurl="${userUrl}"`
                            + '>'
                            + '&nbsp;');

            // The transcript and search pages don't open links in a new window by default,
            // so fix that. Although this is normally dreadful behavior not to allow the
            // user to be in full control, in this case, we don't want to lose our place
            // in the transcript, and if one is used to handling it from the room view
            // (where links do open in a new window by default), one might be caught
            // very off-guard and end up all discombobulated. Can't have that!
            if (IS_TRANSCRIPT || IS_SEARCH)
            {
               userLink[0].setAttribute('target', '_blank');
            }
         }
      }
   }


   function getChatFkey()
   {
      return new Promise(function(resolve, reject)
      {
         if (fkey?.fkey)
         {
            resolve(fkey.fkey());
         }
         else
         {
            // The "search" page does not define the user's chat FKEY anywhere,
            // so we need to fetch it from a page that does.
            GM_XML_HTTP_REQUEST(
            {
               method : 'GET',
               url    : `//${HOSTNAME_CHAT}`,
               onload : (result) =>
                        {
                           const fkeyInput = $(result.response).find('input#fkey');
                           if (fkeyInput && fkeyInput.length)
                           {
                              resolve(fkeyInput.val());
                           }
                           else
                           {
                              alert('Failed to get your chat account\'s FKEY.');
                              reject();
                           }
                        },
               onerror: reject,
               onabort: reject,
            });
         }
      });
   }

   function getChatMessage(fkeyChat, messageId)
   {
      return new Promise(function(resolve, reject)
      {
            $.get(`//${HOSTNAME_CHAT}/message/${messageId}`,
                  {
                     fkey : fkeyChat,
                     plain: true,
                  })
                  .done((result) =>
                  {
                     resolve(result);
                  })
                  .fail(reject);
      });
   }

   function editChatMessage(fkeyChat, messageId, messageText)
   {
      return new Promise(function(resolve, reject)
      {
         $.post(`//${HOSTNAME_CHAT}/messages/${messageId}`,
                {
                  fkey: fkeyChat,
                  text: messageText,
                })
                .done(resolve)
                .fail(reject);
      });
   }

   function strikeoutChatMessage(messageId)
   {
      const STRIKEOUT_MARKDOWN = '---';
      return new Promise(function(resolve, reject)
      {
         getChatFkey()
         .then((fkeyChat) =>
         {
            getChatMessage(fkeyChat, messageId)
            .then((messageText) =>
            {
               if (messageText)
               {
                  const prefix = messageText.match(/\[ \[.*\]\(.*\) \] /)[0];
                  if (prefix)
                  {
                     const main = messageText.slice(prefix.length);
                     editChatMessage(fkeyChat,
                                     messageId,
                                     `${prefix}${STRIKEOUT_MARKDOWN}${main}${STRIKEOUT_MARKDOWN}`);
                     resolve();
                  }
               }

               reject();
            })
            .catch(reject);
            })
         .catch(reject);
      });
   }


   function getMainSiteFkey(siteHostname)
   {
      return new Promise(function(resolve, reject)
      {
         if (siteHostname == null)
         {
            reject();
         }

         GM_XML_HTTP_REQUEST(
         {
            method : 'GET',
            url    : `//${siteHostname}/users/${CHAT.CURRENT_USER_ID}`,
            onload : (result) => { resolve($(result.response).find('input[name="fkey"]')[0].value); },
            onerror: reject,
            onabort: reject,
         });
      });
   }


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


    function getUserPii(mainSiteFkey, siteHostname, userId)
    {
       return new Promise(function(resolve, reject)
       {
          if ((mainSiteFkey == null) ||
              (siteHostname == null) ||
              (userId       == null))
          {
             reject();
          }

          const data = new URLSearchParams(
          {
             'fkey': mainSiteFkey,
             'id'  : userId,
          });
          GM_XML_HTTP_REQUEST(
          {
             method : 'POST',
             url    : `//${siteHostname}/admin/all-pii`,
             headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
             data   : data.toString(),
             onload : (result) =>
                      {
                         const html = $(result.responseText);
                         const ip   = html.find('div:contains("IP Address:") + div > span.ip-address-lookup');
                         resolve(
                         {
                            name  : html.find('div:contains("Real Name:") + div > a').text().trim(),
                            email : html.find('div:contains("Email:") + div > a').text().trim(),
                            ip    : ip.text().trim(),
                            tor   : ip.data('tor').trim(),
                         });
                      },
             onerror: reject,
             onabort: reject,
          });
       });
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

   function destroyUser(mainSiteFkey,
                        siteHostname,
                        userInfo,
                        destroyDetails = null)
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
            const data = new URLSearchParams(
            {
               'fkey'                : mainSiteFkey,
               'annotation'          : '',
               'deleteReasonDetails' : '',
               'mod-actions'         : 'destroy',
               'destroyReason'       : 'This user was created to post spam or nonsense and has no other positive participation',
               'destroyReasonDetails': details,
            });
            GM_XML_HTTP_REQUEST(
            {
               method : 'POST',
               url    : `//${siteHostname}/admin/users/${userInfo.user_id}/destroy`,
               headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
               data   : data.toString(),
               onload : resolve,
               onerror: reject,
               onabort: reject,
            });
         })
         .catch(reject);
      });
   }

   function nukeUser(mainSiteFkey,
                     siteHostname,
                     userInfo,
                     destroyDetails = null,
                     templateName   = null,
                     suspendReason  = null)
   {
      if ((templateName == null) && (suspendReason == null))
      {
         return destroyUser(mainSiteFkey, siteHostname, userInfo, destroyDetails);
      }
      else
      {
         return new Promise(function(resolve, reject)
         {
            // Apply the maximum suspension period (1 year) before destroying the account,
            // skipping the sending of an email to the user's registered email address.
            // This way, they'll only see the message on the site, which, of course,
            // means they won't ever see it, since we're about to destroy their account.
            sendModMessage(mainSiteFkey,
                           siteHostname,
                           userInfo.user_id,
                           templateName,
                           suspendReason,
                           'So long, farewell, auf wiedersehen, adieu,  \n' +
                           'Adieu, adieu, to yieu and yieu and yieu.',
                           false,
                           365)
            .then(() =>
            {
               destroyUser(mainSiteFkey, siteHostname, userInfo, destroyDetails)
               .then(resolve)
               .catch(reject);
            })
            .catch(reject);
         });
      }
   }


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
                               + 'A reason is optional; if you do not want to include additional information, '
                               + 'choose the "custom" reason and simply leave the associated textbox blank. '
                               + 'The user\'s PII and other metadata will always be automatically fetched and '
                               + 'included in the record.';
      content.append(instructions);

      const checkbox = document.createElement('div');
      checkbox.classList.add('swal-content');
      checkbox.innerHTML = '<input type="checkbox" name="userstalker-suspend-toggle" id="userstalker-suspend-toggle" checked />' +
                           '<label for="userstalker-suspend-toggle">Suspend for maximum duration of 1 year before destroying</label>';
      content.append(checkbox);

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

      const userId           = Number(userUrl.match(/-?\d+/));

      const siteHostname     = new URL(userUrl).hostname;

      getUserInfofromApi(siteHostname, userId).then((userInfo) =>
      {
         swal(
         {
           title  : 'Destroy the user "' + userInfo.display_name + '\" because\u2026',
           buttons:
           {
              confirm:
              {
                 text      : 'Destroy "' + userInfo.display_name + '\"',
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
           closeOnClickOutside: false,
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
               const suspendFirst    = document.querySelector('.swal-content input#userstalker-suspend-toggle').checked;
               const templateName    = (suspendFirst ? DESTROY_OPTIONS[selectedReason].templateName  : null);
               const suspendReason   = (suspendFirst ? DESTROY_OPTIONS[selectedReason].suspendReason : null);
               getMainSiteFkey(siteHostname)
               .then((mainSiteFkey) =>
               {
                  nukeUser(mainSiteFkey,
                           siteHostname,
                           userInfo,
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

                        // Transcript and search pages do not auto-update when a message is edited,
                        // so force a refresh at this point.
                        if (IS_TRANSCRIPT || IS_SEARCH)
                        {
                           setTimeout(() => { window.location.reload(); },
                                      1000);
                        }
                     })
                     .catch((ex) =>
                     {
                        alert('Failed to edit the bot\'s chat message to add strike-out formatting.\n\n' + ex);

                        swal.stopLoading();
                        swal.close();
                     });
                  })
                  .catch((ex) =>
                  {
                     alert('Failed to nuke the user.\n\n' + ex);

                     swal.stopLoading();
                     swal.close();
                  });
               })
               .catch((ex) =>
               {
                  alert('Failed to get your main site account\'s FKEY.\n\n' + ex);

                  swal.stopLoading();
                  swal.close();
               });
            }
         });
      })
      .catch((ex) =>
      {
         alert('Failed to get the display name of the user to nuke from the SE API.\n\n' + ex);
      });
   }


   function appendStyles()
   {
      const styles = `
<style>
img.userstalker-nuke-button
{
   width: 16px;
   height: 16px;
   position: relative;
   top: -3px;
   cursor: pointer;
   opacity: 0.66;
}
img.userstalker-nuke-button:hover,
img.userstalker-nuke-button:active
{
   opacity: 1;
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
