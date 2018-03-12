const _ = require('lodash')
const axios = require('axios')
const co = require('co')
const selfDebug = require('debug')
const deep = require('deep')
const fs = require('fs-extra')
const https = require('https')
const semver = require('semver')

const apiConfig = require('./config')

const inCluster = fs.pathExistsSync(
	'/var/run/secrets/kubernetes.io/serviceaccount/namespace'
)

const ns = {}
let kube
let isGlobal
let apiStructure = {}
let currentNamespace
if (inCluster) {
	currentNamespace = fs.readFileSync(
		'/var/run/secrets/kubernetes.io/serviceaccount/namespace',
		'utf8'
	)
} else {
	currentNamespace = process.env.POD_NAMESPACE
		? process.env.POD_NAMESPACE
		: 'kube-system'
}
console.log('inCluster', inCluster)

const contentType = 'application/json'
axios.defaults.headers = {
	common: {
		'Content-Type': contentType
	}
}

ns.clusterAccess = inCluster => {
	const debug = selfDebug('dynamic-k8pi:inCluster')
	if (inCluster) {
		debug('Detected Container Running in Kubernetes')
		const conf = apiConfig.getInCluster()
		axios.defaults.baseURL = conf.url.replace(/([a-z]$)/, '$1/')
		debug('conf', conf)

		return {
			httpsAgent: new https.Agent({
				ca: conf.ca,
				auth: null
			}),
			headers: {
				common: {
					Authorization: 'Bearer ' + conf.auth.bearer
				}
			}
		}
	}

	debug('Development Machine Detected')
	debug('CONTEXT', process.env.CONTEXT)
	const conf = apiConfig.fromKubeconfig(null, process.env.CONTEXT)
	axios.defaults.baseURL = conf.url.replace(/([a-z]$)/, '$1/')
	debug('conf', conf)

	if (conf.user && conf.pass) {
		return {
			httpsAgent: new https.Agent(
				_.merge(_.omit(conf, ['user', 'pass']), {
					auth: conf.user + ':' + conf.pass
				})
			)
		}
	}

	if (conf.auth && conf.auth.bearer) {
		debug('bearer', conf.auth.bearer)
		return {
			headers: {common: {Authorization: 'Bearer ' + conf.auth.bearer}},
			httpsAgent: new https.Agent(
				_.merge(conf, {
					auth: null
				})
			)
		}
	}

	return {
		httpsAgent: new https.Agent(
			_.merge(conf, {
				auth: null
			})
		)
	}
}

ns.init = co.wrap(function*(returnStructure = false) {
	const debug = selfDebug('dynamic-k8pi:init')
	kube = axios.create(ns.clusterAccess(inCluster))
	const struct = yield ns.generateStructure()
	debug('struct', struct)
	debug('currentNamespace', currentNamespace)
	if (currentNamespace.includes('kube-system')) {
		isGlobal = true
		apiStructure = _.cloneDeep(struct)
	} else {
		apiStructure = {}
		const namespacedOnly = deep.select(struct, obj => {
			return _.has(obj, 'namespaced') && obj.namespaced === true
		})
		namespacedOnly.map(item => {
			return _.set(
				apiStructure,
				item.path.join('.'),
				_.get(struct, item.path.join('.'))
			)
		})
		isGlobal = false
	}
	debug('isGlobal', isGlobal)
	debug('apiStructure', apiStructure)
	if (returnStructure) {
		return {
			apiStructure,
			kube
		}
	}

	return kube
})

ns.generateStructure = co.wrap(function*() {
	const debug = selfDebug('dynamic-k8pi:generateStructure')
	// TODO enable lazyload for API endpoints
	const versions = yield kube.get('api')
	const backendAPIStructure = {}

	yield versions.data.versions.map(
		co.wrap(function*(version) {
			const resources = yield kube.get('api/' + version)
			resources.data.resources.map(resource => {
				if (!resource.name.includes('/')) {
					_.set(
						backendAPIStructure,
						'api.' +
							version.replace(/\./g, '~') +
							'.' +
							resource.name.replace(/\./g, '~'),
						_.omit(resource, 'name')
					)
					return true
				}
				return false
			})
		})
	)

	const groups = yield kube.get('apis')

	yield groups.data.groups.map(
		co.wrap(function*(group) {
			yield group.versions.map(
				co.wrap(function*(version) {
					const resources = yield kube.get(
						'apis/' + group.name + '/' + version.version
					)
					resources.data.resources.map(resource => {
						if (!resource.name.includes('/')) {
							_.set(
								backendAPIStructure,
								'apis.' +
									group.name.replace(/\./g, '~') +
									'.' +
									version.version.replace(/\./g, '~') +
									'.' +
									resource.name.replace(/\./g, '~'),
								_.omit(resource, 'name')
							)
							return true
						}
						return false
					})
				})
			)
		})
	)

	// Add API version for template generation assistance
	const version = yield kube.get('version')
	_.set(backendAPIStructure, 'version', version.data)

	debug('backendAPIStructure', backendAPIStructure)
	return backendAPIStructure
})

ns.formURL = data => {
	const debug = selfDebug('dynamic-k8pi:formURL')
	let localData
	if (_.has(data, 'metadata.namespace')) {
		localData = isGlobal
			? _.merge(data, {metadata: {namespace: 'kube-system'}})
			: _.merge(data, {metadata: {namespace: currentNamespace}})
	} else {
		localData = _.cloneDeep(data)
	}
	let urlPath = deep.select(apiStructure, obj => {
		return obj === localData.kind
	})
	debug('urlPath', urlPath)

	// Scan for API Versioning and find latest version
	let isSemver = false
	let isV = false
	const apiVal = urlPath.map(item => {
		let val
		item.path.map(scan => {
			const tmpItem = scan.toLowerCase()
			if (
				typeof semver.valid(item) === 'string' ||
				tmpItem.match(/v*[0-9]+[a-z]*[0-9]*/) !== null
			) {
				val = tmpItem
			}
			return val
		})
		if (typeof semver.valid(val) === 'string') {
			isSemver = true
			return val
		}
		// Format of alpha || beta
		if (val.startsWith('v')) {
			val = val.substring(1)
			isV = true
		}
		const alphStart = val.match('alpha|beta')
		if (alphStart) {
			const alphEnd = val.match(/[a-z][0-9]+$/)
			let alph = val.substring(alphStart.index, alphEnd.index + 1)
			switch (alph) {
				case 'alpha':
					alph = 1
					break
				case 'beta':
					alph = 2
					break
				default:
					break
			}
			return (
				val.substring(0, alphStart.index) -
				1 +
				'.' +
				alph +
				'.' +
				val.substring(alphEnd.index + 1, val.length)
			)
		}
		return val.substring(0, val.length) + '.0.0'
	})
	let apiVer = apiVal.sort().pop()
	if (!isSemver) {
		let tmpVal = apiVer.split('.')
		if (apiVer.includes('.0.0')) {
			tmpVal = [tmpVal[0]]
		} else {
			tmpVal[0] = Number(tmpVal[0]) + 1
			switch (Number(tmpVal[1])) {
				case 1:
					tmpVal[1] = 'alpha'
					break
				case 2:
					tmpVal[1] = 'beta'
					break
				default:
					break
			}
		}
		apiVer = (isV ? 'v' : '') + tmpVal.join('')
	}
	urlPath = urlPath.filter(item => item.path.includes(apiVer))[0].path

	const endIndex = urlPath
		.map(item => {
			return item.includes(localData.kind.toLowerCase())
		})
		.indexOf(true)

	let urlReturn = urlPath.slice(0, endIndex + 1)
	const isNamespaced = _.get(apiStructure, urlReturn.join('.') + '.namespaced')
	if (isNamespaced) {
		if (isGlobal) {
			urlReturn = _.concat(urlPath.slice(0, endIndex), [
				'namespaces',
				localData.metadata.namespace
			])
		} else {
			urlReturn = _.concat(urlPath.slice(0, endIndex), [
				'namespaces',
				currentNamespace
			])
		}
		urlReturn = _.concat(urlReturn, urlPath.slice(endIndex, endIndex + 1))
	}

	// Convert '~' back to '.' for final URL
	urlReturn = urlReturn.map(item => item.replace(/~/g, '.'))

	return urlReturn.join('/')
}

process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection at: Promise', p, 'reason:', reason)
})

if (process.env.NODE_ENV === 'production') {
	module.exports = ns.default
} else {
	module.exports = _.merge(ns, inCluster)
}
console.log(module.exports)
