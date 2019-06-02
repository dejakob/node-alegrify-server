const { exec } = require('child_process');

function DeployApi(app) {
    try {
        const hostname = require('os').hostname();
        if (hostname === 'alegrifyrc') {
            app.post('/deploy', postDayInReview);
        }
    }
    catch (ex) {}

    async function postDayInReview(request, response) {
        const { magic_password } = request.body;

        if (magic_password === 'PASSWORD') {
            response
                .status(200)
                .json({});

            exec('cd alegrify-server && ./deploy.sh', (err, output, errOutput) => {});

            process.exitCode = 1;
        }
        else {
            response.status(403).json({});
        }
    }
}

module.exports = DeployApi;