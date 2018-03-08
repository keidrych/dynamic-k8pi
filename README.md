# Dynamic K8pi (K8's API)

Kubernetes API undergoes regular revisions and structural changes, which unfortunately has resulted in may of the NPM libraries unintentionally locking to specific Kubernetes releases.

This library performs several helper / common functions to assist interaction with Kubernetes API
- Full API & API's Endpoint discovery
- Generation of EndPoint url for any requested 'Kind'
- Always tracks latest API Version for each endpoint i.e. v1 over v1beta1

## ENV's

In-Cluster no environmental variables are necessary as Kubernetes pushes in `namespace` and API Access Keys into all PODS by default. 

When running locally the following ENV's can be relevant
- POD_NAMESPACE: {Default: kube-system}
- CONTEXT: KubeCtl context to use for cluster access

## API

### init(returnStructure)
returnStructure: true / false if return object should include API structure
Returns: [Axios](https://www.npmjs.com/package/axios) object preconfigured with API access

### formURL(data)
data: expectation is the actual object that should be passed to Kubernetes API but its not necessary to pass the full object.

Returns: URL base string for REST interactions based on the data object passed in.

```
data object
{
	kind: 'Service'	# API endpoint for access
		metadata: {		# Optional (enabled in kube-system namespace)
			namespace: 'default' 
		}
}
```

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for *development and testing* purposes. See deployment for notes on how to deploy the project on a live system.

### Prerequisites

- Node 6.12.x or higher (LTS when development commenced)
- [TAP](https://www.npmjs.com/package/tap)

```
npm install --global tap
```

### Installing

A step by step series of examples that tell you how to get a development env running

```
git clone git@github.com:TayloredTechnology/dynamic-k8pi.git
cd dynamic-k8pi
npm install
```

## Running the tests

[TAP](https://testanything.org/) is used for all tests

```
# Execute all application tests
npm test
```

Code Coverage is provided by [CodeCov](https://codecov.io).

### And coding style tests

[XO](https://github.com/sindresorhus/xo) is used with [Prettier](https://github.com/prettier/prettier) for linting & code style.

```
npm run lint
```

## Built With

- [CodeCov](http://codecov.io/)
- [DependencyCI](http://dependencyci.com/)
- [Node @6.12.x](https://nodejs.org/docs/latest-v6.x/api/)
- [Release IT](https://webpro.github.io/release-it/)
- [RenovateApp](http://renovateapp.com/)
- [SNYK](http://snyk.io/)

## Contributing

Please read [CONTRIBUTING.md]() for details on our code of conduct, and the process for submitting pull requests to us.

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/TayloredTechnology/dynamic-k8pi/tags).

## Authors

- **Keidrych Anton-Oates** - *Initial work* - [Taylored Technology](https://tayloredtechnology.net)

See also the list of [contributors](https://github.com/TayloredTechnology/contributors) who participated in this project.

## License

This project is licensed under the Mozilla Public License Version 2.0 - see the [LICENSE](LICENSE) file for details

## Acknowledgments

- NPM Community for consistenly making packages that accelerate development work
- [Test Anything Protocol](https://testanything.org/) for consistenly accelerating Feature Driven Design
