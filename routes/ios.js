var express = require('express');
const axios = require('axios');
var router = express.Router();
var FormData = require('form-data');

const project_id = process.env.PROJECT_ID;
const authToken = process.env.AUTH_TOKEN;
const triggerToken = process.env.TRIGGER_TOKEN;
const slackAccessToken = process.env.SLACK_CHANNEL_ACCESS_TOKEN;

const branches_api = `https://gitlab.com/api/v4/projects/${project_id}/repository/branches`;
const trigger_api = `https://gitlab.com/api/v4/projects/${project_id}/trigger/pipeline`;
const pipeline_api = `https://gitlab.com/api/v4/projects/${project_id}/pipelines`;

function generateSuccessReply(user_id, ticket, ref){
  return {
      "replace_original": true,
      "text": `${user_id} Your request is submitted. Relax :coffee:\n> This usually takes 5-10 minutes. I *will ping you* once its done.\n> Your ticket_id - ${ticket} \n> Branch Selected - *${ref}*\nYou can anytime do */get_status [ticket_id]* to know about request status`
    }
}

function getPipelinesEndpoind(pipeline_id){
  return `${pipeline_api}/${pipeline_id}`;
}

function getBranchesEndpoint(limit, page = 1){
  return `${branches_api}?per_page=${limit}&page=${page}`;
}

function getErrorMessage(errorMsg){
  return `Something went wrong :cry: (${errorMsg})\n>Ping Semenihin to fix this.`;
}

router.get('/', function(req, res, next) {});

//Any interactions interactive components (such as buttons, select menus, and datepickers) will be sent to this end point.
router.post('/actions', async (req,res) => {
    try {
        const payload = JSON.parse(req.body.payload);

        if (payload.callback_id === 'query_selection') {
            console.log(payload.actions)
            const selected_value = payload.actions[0].selected_options[0].value.split('|');
            const user_id = `<@${payload.user.id}>`;
            const channel_id = payload.channel.id;;
            const branch_selected = selected_value[0];
            const env = selected_value[1];

            var bodyForm = new FormData();
            bodyForm.append('token', triggerToken);
            bodyForm.append('ref', branch_selected);
            bodyForm.append('variables[CONFIG]', env);
          //  bodyForm.append('variables[CONFIG]=${env}');
            bodyForm.append('variables[SLACK_REFERRER_ID]', user_id);
            bodyForm.append('variables[SLACK_CHANNEL_ID]', channel_id);
            bodyForm.append('variables[SLACK_CHANNEL_ACCESS_TOKEN]', slackAccessToken);

            axios({
                method: 'post',
                url: trigger_api,
                data: bodyForm,
                headers: bodyForm.getHeaders()
                })
                .then(function (response) {
                    const ticket = response.data.id;
                    const ref = response.data.ref;
                    if(ticket != undefined){
                      return res.send(generateSuccessReply(user_id, ticket, ref));
                    }else{
                      return res.send(`${response.data.message.base} \n>There is some error with this branch, ping someone from *engineering-team* to fix this.`);
                    }
                })
                .catch(function (response) {
                    console.log(response);
                    return res.send(getErrorMessage(`inside actions while triggering pipeline`));
                });
        }else{
            return res.send(getErrorMessage(`inside actions unknown reponse from SlackApi`));
        }
      } catch (err) {
        console.log(err);
        return res.status(500).send(getErrorMessage(`error with code execution /actions`));
      }
});

//Triggered from using a slash command. This will post the instructions to slack-api.
router.post('/help',function(req,res) {
    try {
        res.send(`Select a *branch* from the response and relax!\n>If you have already placed a request, You can use */get_status [ticked_id]* to get the status of your request`);
      } catch (err) {
        console.log(err);
        return res.status(500).send(getErrorMessage(`error with code execution /help`));
      }
});

router.post('/build',function(req,res) {
  console.log(retrieveBranches(1));
  const allPromise = Promise.all([retrieveBranches(1), retrieveBranches(2), retrieveBranches(3), retrieveBranches(4)])
    try {
      allPromise
        .then(response => {
            const user_id = `<@${req.body.user_id}>`;
            const channel_id = req.body.channel_id;

            var branch_list = response
              .map(function(el) {
                return el.data
              })
              .flat()
              .sort(function(a,b) {
                return new Date(b.commit.committed_date) - new Date(a.commit.committed_date)
              })
              .map(function(el) {
                const branch = {
                    text: el.name,
                    value: el.name
                };
                return branch;
            });
            const final_response = {
                response_type: 'in_channel',
                channel: channel_id,
                text: `Hey ${user_id} ..,`,
                attachments: [{
                  text: 'Select branch which shoud be build:',
                  fallback: 'Select branch which shoud be build:',
                  color: '#2c963f',
                  attachment_type: 'default',
                  callback_id: 'query_selection',
                  actions: [{
                    name: 'query_select_menu',
                    text: 'Choose an branch...',
                    type: 'select',
                    options: branch_list,
                  }],
                }],
              };
              return res.json(final_response);
        })
        .catch((error) => {
            console.log(error);
            return res.status(500).send(getErrorMessage(`fetching branches`));
        });
      } catch (err) {
        console.log(err);
        return res.status(500).send(getErrorMessage(`error with code execution /build`));
      }
});

//Triggered from using a slash command. This will check the status of pipeline corresponding to the given id and post the details back to slack-api.
router.post('/get_status',function(req,res) {
    try {
      axios.get(getPipelinesEndpoind(req.body.text), { 'headers': { 'PRIVATE-TOKEN': authToken }} )
      .then(response => {
          const pipeline_id = response.data.id;
          const status = response.data.status;
          const ref = response.data.ref;
          const user_id = `<@${req.body.user_id}>`;
          if(pipeline_id != undefined){
            res.send(`Hi ${user_id}, Your request *${ref} branch* (ticket : ${pipeline_id})\n> status : *${status}*`);
          }else{
            res.send(`Something went wrong. ${response.data.error}`);
          }
      })
      .catch((error) => {
          console.log(error);
          return res.status(500).send(getErrorMessage(`inside getStatus while fetching pipeline status`));
      });
      } catch (err) {
        console.log(err);
        return res.status(500).send(getErrorMessage(`error with code execution /get_status`));
      }
});

module.exports = router;

function retrieveBranches(page) {
  return axios.get(getBranchesEndpoint(100, page), {'headers': { 'PRIVATE-TOKEN': authToken }})
}

Array.prototype.insert = function ( index, item ) {
    this.splice( index, 0, item );
};
