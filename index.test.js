// Setup Info
'use strict'

const isInstalled = require('is-installed').sync
const os = require('os')
const otherName = __filename.replace(/\.(check|test|api)\.js$/, '.js')
const t = require('tap')
const td = require('testdouble')
const tp = require('tapromise')
const nock = require('nock')
const Validator = require('fastest-validator')

let other
const v = new Validator()
const resetOther = () => {
	require('clear-require')(otherName)
	other = require(otherName)
}

t.jobs = os.cpus().length

process.env.DEBUG = 'dynamic-k8pi'
process.env.CONTEXT = 'minikube'

// Tests
t.test('npm modules installed', t => {
	t.ok(isInstalled('axios'), 'axios installed')
	t.ok(isInstalled('co'), 'co installed')
	t.ok(isInstalled('debug'), 'debug installed')
	t.ok(isInstalled('deep'), 'deep installed')
	t.ok(isInstalled('fs-extra'), 'fs-extra installed')
	t.ok(isInstalled('lodash'), 'lodash installed')
	t.ok(isInstalled('semver'), 'semver installed')
})

td
	.when(
		td
			.replace('fs-extra')
			.pathExistsSync('/var/run/secrets/kubernetes.io/serviceaccount/namespace')
	)
	.thenReturn(true)
const configTD = td.replace('./config')
td
	.when(configTD.getInCluster())
	.thenReturn({ca: 'mockCa', url: 'mockURL', auth: {bearer: 'mockAuth'}})
td.when(configTD.fromKubeconfig(null, 'minikube')).thenReturn({url: 'mockURL'})
resetOther()
t.only('cluster access information', t => {
	t = tp(t)
	const schema = {
		inClusterTrue: {
			httpsAgent: 'object',
			headers: {
				type: 'object',
				props: {
					common: {
						type: 'object',
						props: {
							Authorization: 'string'
						}
					}
				}
			}
		},
		inClusterFalse: {
			httpsAgent: 'object'
		}
	}
	const inClusterTrue = other.clusterAccess(true)
	const inClusterFalse = other.clusterAccess(false)
	return Promise.all([
		t.ok(other.inCluster, 'ensure running inCluster'),
		t.ok(
			v.validate(inClusterTrue, schema.inClusterTrue),
			'inCluster validation Passes'
		),
		t.ok(
			inClusterTrue.headers.common.Authorization.includes('Bearer mockAuth'),
			'inCluster auth headers set'
		),
		t.ok(
			v.validate(inClusterFalse, schema.inClusterFalse),
			'outCluster validation passes'
		)
	])
})

td.reset()

t.end()
