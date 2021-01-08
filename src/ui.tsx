import * as ReactDOM from "react-dom";
import * as React from "react";
import { detailedDiff } from "deep-object-diff";
import { CopyToClipboard } from "react-copy-to-clipboard";

import Loader from "components/Loader";
import getOldColors from "services/getOldColors";
import updateRemoteColors from "services/updateRemoteColors";
import Review from "views/Review";

import "./ui.css";

enum Step {
  INFO = "INFO",
  REVIEW = "REVIEW",
  LOADING = "LOADING",
  SUCCESS = "SUCCESS",
}

interface StateProps {
  step: Step;
  newColors: Object;
  encodedColorsFile: {
    sha: string;
  };
  userName: string;
  userEmail: string;
  token: string;
  repository: string;
  colorsFilepath: string;
  branchRef: string;
  colorDiff: Object;
  oldColors: Object;
  PRLink: string;
  error: Error | null;
  copied: boolean;
}

const initialState = {
  newColors: {},
  encodedColorsFile: {
    sha: "",
  },
  colorDiff: {},
  oldColors: {},
  PRLink: "",
  error: null,
  copied: false,
};

class App extends React.Component<{}, StateProps> {
  constructor(props) {
    super(props);
    this.state = {
      step: Step.INFO,
      userName: "",
      userEmail: "",
      token: "",
      repository: "",
      colorsFilepath: "",
      branchRef: "",
      ...initialState,
    };
  }

  handleChange = (value: string) => (event) => {
    this.setState({ [value]: event.target.value } as Pick<
      StateProps,
      keyof StateProps
    >);
  };

  sendStyleChanges = (event?: React.FormEvent) => {
    if (event) {
      event.preventDefault();
    }
    // Save info to figma storage
    parent.postMessage(
      {
        pluginMessage: {
          type: "SAVE_INFO",
          userName: this.state.userName,
          userEmail: this.state.userEmail,
          token: this.state.token,
          repository: this.state.repository,
          colorsFilepath: this.state.colorsFilepath,
          branchRef: this.state.branchRef,
        },
      },
      "*"
    );
    // Get new colors
    parent.postMessage({ pluginMessage: { type: "GET_NEW_COLORS" } }, "*");
  };

  goToStep = (step: Step) => () => {
    this.setState({ copied: false });
    if (step === Step.INFO) {
      this.setState(initialState);
    }
    this.setState({ step });
  };

  validateChanges = async (event) => {
    event.preventDefault();

    console.info("New Colors to send to repo", this.state.newColors);

    //Send colors to Repo
    this.goToStep(Step.LOADING)();
    try {
      const PRLink = await updateRemoteColors(this.state.newColors, {
        token: this.state.token,
        sha: this.state.encodedColorsFile.sha,
        userName: this.state.userName,
        userEmail: this.state.userEmail,
        repository: this.state.repository,
        colorsFilepath: this.state.colorsFilepath,
        branchRef: this.state.branchRef,
      });
      this.setState({ PRLink });
      this.goToStep(Step.SUCCESS)();
    } catch (error) {
      this.goToStep(Step.INFO)();
      this.setState({ error });
    }
  };

  componentDidMount() {
    onmessage = async (event) => {
      const { pluginMessage } = event.data;

      switch (pluginMessage.type) {
        case "REHYDRATE_INFO":
          // Fill info from localStorage
          if (pluginMessage.name) {
            this.setState({ userName: pluginMessage.name });
          }
          if (pluginMessage.email) {
            this.setState({ userEmail: pluginMessage.email });
          }
          if (pluginMessage.token) {
            this.setState({ token: pluginMessage.token });
          }
          if (pluginMessage.repository) {
            this.setState({ repository: pluginMessage.repository });
          }
          if (pluginMessage.colorsFilepath) {
            this.setState({ colorsFilepath: pluginMessage.colorsFilepath });
          }
          if (pluginMessage.branchRef) {
            this.setState({ branchRef: pluginMessage.branchRef });
          }

          // Auto validate step if all inputs are filled
          if (this.state.userName !== "" && this.state.userEmail !== "" && this.state.token !== "" && this.state.repository !== "" && this.state.colorsFilepath !== "" && this.state.branchRef !== "") {
            this.sendStyleChanges()
          }
          break;
        case "NEW_COLORS":
          this.setState({ newColors: pluginMessage.newColors });
          try {
            const { oldColors, encodedColorsFile } = await getOldColors(
              this.state.repository,
              this.state.colorsFilepath,
              this.state.branchRef,
              this.state.token
            );
            this.setState({ encodedColorsFile });

            const colorDiff = detailedDiff(oldColors, this.state.newColors);
            this.goToStep(Step.REVIEW)();
            this.setState({ colorDiff, oldColors });
          } catch (error) {
            this.setState({ error });
          }
          break;
        case "NEW_COLORS_ERROR":
          this.setState({ error: pluginMessage.error });
          break;
      }
    };
  }

  render() {
    return (
      <>
        {this.state.step === Step.INFO && (
          <form id="send-style-changes" onSubmit={this.sendStyleChanges}>
            <p>
              This plugin helps you export your local styles (colors...) to the
              code repository of your project.
            </p>
            <p>
              We'll grab the styles defined in the current Figma project and
              create a pull request to update the project code.
            </p>
            <p className="banner info-banner">
              <span className="info-icon">?</span>Step 1/2: Make sure your
              information are correct
            </p>
            {this.state.error && (
              <p className="banner error-banner">
                🚨 {this.state.error.toString()} <br />
                <i
                  className="error-banner-dismiss"
                  onClick={() => this.setState({ error: null })}
                >
                  Dismiss
                </i>
              </p>
            )}
            <div className="form-container">
              <p>
                <label className="text-input-label">
                  Name*
                  <br />
                  <input
                    id="name-input"
                    onChange={this.handleChange("userName")}
                    value={this.state.userName}
                  />
                </label>
              </p>
              <p>
                <label className="text-input-label">
                  Email*
                  <br />
                  <input
                    id="email-input"
                    onChange={this.handleChange("userEmail")}
                    value={this.state.userEmail}
                  />
                </label>
              </p>
              <p>
                <label className="text-input-label">
                  Github Personnal Access Token*
                  <br />
                  <input
                    id="token"
                    type="password"
                    onChange={this.handleChange("token")}
                    value={this.state.token}
                  />
                </label>
              </p>
              <p>
                <label className="text-input-label">
                  Github Repository Name*
                  <br />
                  <input
                    id="repository-input"
                    placeholder="GithubNamespace/repository"
                    onChange={this.handleChange("repository")}
                    value={this.state.repository}
                  />
                </label>
              </p>
              <p>
                <label className="text-input-label">
                  Colors file path*
                  <br />
                  <input
                    id="colorsfilepath-input"
                    placeholder="src/globals/colors.json"
                    onChange={this.handleChange("colorsFilepath")}
                    value={this.state.colorsFilepath}
                  />
                </label>
              </p>
              <p>
                <label className="text-input-label">
                  Branch reference*
                  <br />
                  <input
                    id="branchref-input"
                    placeholder="master"
                    onChange={this.handleChange("branchRef")}
                    value={this.state.branchRef}
                  />
                </label>
              </p>
            </div>
            <div className="validate-section">
              <button type="submit" id="send">
                Export colors
              </button>
            </div>
          </form>
        )}
        {this.state.step === Step.REVIEW && (
          <div id="confirmation-panel">
            <Review
              colorDiff={this.state.colorDiff}
              oldColors={this.state.oldColors}
            />
            <div className="validate-section">
              <button
                type="submit"
                id="back-step-1"
                className="ghost"
                onClick={this.goToStep(Step.INFO)}
              >
                Back
              </button>
              <button
                type="submit"
                onClick={this.validateChanges}
                id="validate"
              >
                Validate
              </button>
            </div>
          </div>
        )}
        {this.state.step === Step.SUCCESS && (
          <div id="success-panel">
            <p className="banner success-banner">
              ✅ Your changes were successfully sent! Share your work with the
              developers
            </p>
            <div className="pr-link-container">
              <a
                id="pull-request-link"
                target="_blank"
                rel="noopener"
                href={this.state.PRLink}
              >
                {this.state.PRLink}
              </a>
              <div>
                <CopyToClipboard
                  text={this.state.PRLink}
                  onCopy={() => this.setState({ copied: true })}
                >
                  <button type="button">
                    {this.state.copied ? "URL copied" : "Copy the URL"}
                  </button>
                </CopyToClipboard>
              </div>
            </div>
            <p>
              <button
                type="submit"
                id="back-step-1-bis"
                className="ghost"
                onClick={this.goToStep(Step.INFO)}
              >
                Back
              </button>
            </p>
          </div>
        )}
        {this.state.step === Step.LOADING && (
          <div id="loader-panel">
            <Loader />
          </div>
        )}
      </>
    );
  }
}

ReactDOM.render(<App />, document.getElementById("plugin-body"));
